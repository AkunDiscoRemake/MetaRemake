package com.zentra.xr.core

import android.opengl.GLES20
import java.nio.FloatBuffer

/** Base class: compiles, links and caches uniform locations. */
abstract class Program(vs: String, fs: String) {

    val id: Int = GlUtil.link(vs, fs)
    private val uniforms = HashMap<String, Int>()

    fun u(name: String): Int = uniforms.getOrPut(name) { GLES20.glGetUniformLocation(id, name) }

    fun a(name: String): Int = GLES20.glGetAttribLocation(id, name)

    open fun use() {
        GLES20.glUseProgram(id)
    }

    fun m4(name: String, m: FloatArray) = GLES20.glUniformMatrix4fv(u(name), 1, false, m, 0)

    fun v4(name: String, x: Float, y: Float, z: Float, w: Float) =
        GLES20.glUniform4f(u(name), x, y, z, w)

    fun v3(name: String, x: Float, y: Float, z: Float) = GLES20.glUniform3f(u(name), x, y, z)

    fun v2(name: String, x: Float, y: Float) = GLES20.glUniform2f(u(name), x, y)

    fun f1(name: String, x: Float) = GLES20.glUniform1f(u(name), x)

    fun i1(name: String, x: Int) = GLES20.glUniform1i(u(name), x)

    fun v4a(name: String, v: FloatArray) = GLES20.glUniform4fv(u(name), 1, v, 0)

    /** Binds [texture] to unit [unit] and points the sampler at it. */
    fun tex(name: String, texture: Int, unit: Int) {
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0 + unit)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texture)
        i1(name, unit)
    }

    fun release() = GLES20.glDeleteProgram(id)
}

private const val VS_QUAD = """
attribute vec3 aPos;
attribute vec2 aUv;
uniform mat4 uMVP;
uniform mat4 uModel;
uniform vec2 uSize;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
    vUv = aUv;
    vec3 p = vec3(aPos.xy * uSize, aPos.z);
    vWorld = (uModel * vec4(p, 1.0)).xyz;
    gl_Position = uMVP * vec4(p, 1.0);
}
"""

/**
 * Signed distance field UI surface. Everything flat in Zentra XR (panels, cards,
 * buttons, sliders, keys, images, video, web content) is drawn with this shader so the
 * interface stays perfectly crisp at any distance and any resolution.
 */
class PanelProgram : Program(VS_QUAD, """
precision highp float;
varying vec2 vUv;
varying vec3 vWorld;

uniform vec2 uHalfSize;
uniform float uRadius;
uniform float uSoft;
uniform float uBorder;
uniform vec4 uFillTop;
uniform vec4 uFillBottom;
uniform vec4 uBorderColor;
uniform vec4 uShadowColor;
uniform float uShadowSize;
uniform float uShadowStrength;
uniform float uGlow;
uniform vec4 uGlowColor;
uniform float uOpacity;
uniform float uUseTex;
uniform float uTexAlpha;
uniform sampler2D uTex;
uniform float uCornerOnly;

float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

void main() {
    vec2 p = (vUv - 0.5) * 2.0 * uHalfSize;
    float d = sdRoundBox(p, uHalfSize, uRadius);
    float aa = max(uSoft, 1e-5);

    float inside = 1.0 - smoothstep(-aa, aa, d);
    float shadow = exp(-max(d, 0.0) / max(uShadowSize, 1e-5)) * uShadowStrength * (1.0 - inside);

    vec4 fill = mix(uFillTop, uFillBottom, clamp(1.0 - vUv.y, 0.0, 1.0));
    if (uUseTex > 0.5) {
        vec4 t = texture2D(uTex, vUv);
        float ta = t.a * uTexAlpha;
        fill.rgb = mix(fill.rgb, t.rgb, ta);
        fill.a = max(fill.a, ta);
    }
    if (uCornerOnly > 0.5) {
        // Radial gradient used for glows / vignettes inside a rounded rect.
        fill.a *= 1.0 - smoothstep(0.0, 1.0, -d / max(uHalfSize.x, 1e-5));
    }

    float bw = uBorder * 0.5;
    float border = (1.0 - smoothstep(bw - aa, bw + aa, abs(d))) * step(0.0005, uBorder);
    vec3 col = mix(fill.rgb, uBorderColor.rgb, border * uBorderColor.a);

    float rim = exp(-abs(d) * 16.0) * uGlow;
    col += uGlowColor.rgb * rim;

    float alpha = inside * uOpacity;
    col = mix(uShadowColor.rgb, col, inside);
    alpha = max(alpha, shadow * uShadowColor.a * uOpacity);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, alpha);
}
""") {
    val aPos = 0
    val aUv = 2
}

/** Tinted textured quad (text glyphs, icons, cursors, HUD elements). */
class SpriteProgram : Program(VS_QUAD, """
precision mediump float;
varying vec2 vUv;
varying vec3 vWorld;
uniform sampler2D uTex;
uniform vec4 uTint;
uniform float uUseTex;
void main() {
    vec4 t = texture2D(uTex, vUv);
    vec4 c = uTint;
    c.a *= mix(1.0, t.a, uUseTex);
    c.rgb *= mix(vec3(1.0), t.rgb, uUseTex);
    if (c.a < 0.004) discard;
    gl_FragColor = c;
}
""") {
    val aPos = 0
    val aUv = 2
}

/** Video frames coming from a SurfaceTexture (OES external sampler). */
class OesProgram : Program(VS_QUAD, """
#extension GL_OES_EGL_image_external : enable
precision mediump float;
varying vec2 vUv;
varying vec3 vWorld;
uniform samplerExternalOES uTex;
uniform vec4 uTint;
void main() {
    vec3 c = texture2D(uTex, vUv).rgb * uTint.rgb;
    gl_FragColor = vec4(c, uTint.a);
}
""") {
    val aPos = a("aPos")
    val aUv = a("aUv")

    fun bindOes(name: String, texture: Int, unit: Int) {
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0 + unit)
        GLES20.glBindTexture(GLES11ExtCompat.GL_TEXTURE_EXTERNAL_OES, texture)
        i1(name, unit)
    }
}

object GLES11ExtCompat {
    const val GL_TEXTURE_EXTERNAL_OES = 0x8D65
}

/** Simple lit material for the 3D objects (targets, blocks, props, logo). */
class LitProgram : Program("""
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec2 aUv;
uniform mat4 uMVP;
uniform mat4 uModel;
uniform mat4 uNormalMat;
varying vec3 vN;
varying vec3 vW;
varying vec2 vUv;
void main() {
    vec4 w = uModel * vec4(aPos, 1.0);
    vW = w.xyz;
    vN = (uNormalMat * vec4(aNormal, 0.0)).xyz;
    vUv = aUv;
    gl_Position = uMVP * vec4(aPos, 1.0);
}
""", """
precision mediump float;
varying vec3 vN;
varying vec3 vW;
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uEmissive;
uniform vec3 uRimColor;
uniform float uRim;
uniform float uAlpha;
uniform float uSpec;
uniform vec3 uCamPos;
uniform vec3 uLightDir;
uniform vec3 uLight2Dir;
uniform float uUseTex;
uniform sampler2D uTex;
void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(uCamPos - vW);
    if (dot(N, V) < 0.0) N = -N;
    vec3 base = uColor;
    if (uUseTex > 0.5) base *= texture2D(uTex, vUv).rgb;
    float d0 = max(dot(N, normalize(uLightDir)), 0.0);
    float d1 = max(dot(N, normalize(uLight2Dir)), 0.0);
    vec3 H = normalize(normalize(uLightDir) + V);
    float spec = pow(max(dot(N, H), 0.0), 42.0) * uSpec;
    vec3 col = base * (0.30 + 0.70 * d0 + 0.22 * d1) + uEmissive + vec3(spec);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    col += uRimColor * fres * uRim;
    gl_FragColor = vec4(col, uAlpha);
}
""") {
    val aPos = a("aPos")
    val aNormal = a("aNormal")
    val aUv = a("aUv")
}

/** Flat coloured geometry (lines, debug, pointer beams). */
class FlatProgram : Program("""
attribute vec3 aPos;
uniform mat4 uMVP;
void main() { gl_Position = uMVP * vec4(aPos, 1.0); }
""", """
precision mediump float;
uniform vec4 uColor;
void main() { gl_FragColor = uColor; }
""") {
    val aPos = a("aPos")
}

/** Procedural environment: gradient sky, starfield and vignette. */
class SkyProgram : Program("""
attribute vec3 aPos;
attribute vec2 aUv;
varying vec2 vUv;
void main() {
    vUv = aUv;
    gl_Position = vec4(aPos, 1.0);
}
""", """
precision mediump float;
varying vec2 vUv;
uniform mat4 uInvVP;
uniform vec3 uTop;
uniform vec3 uBottom;
uniform vec3 uHorizon;
uniform float uStars;
uniform float uTime;

float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
    vec4 p0 = uInvVP * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
    vec4 p1 = uInvVP * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
    vec3 dir = normalize(p1.xyz / p1.w - p0.xyz / p0.w);

    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uBottom, uTop, h);
    float horizon = pow(1.0 - abs(dir.y), 8.0);
    col = mix(col, uHorizon, horizon * 0.65);

    // starfield
    vec3 sp = dir * 110.0;
    vec3 cell = floor(sp);
    float s = hash(cell);
    float twinkle = 0.75 + 0.25 * sin(uTime * 2.0 + s * 40.0);
    float star = step(0.9955, s) * pow(max(0.0, 1.0 - length(fract(sp) - 0.5) * 2.0), 9.0);
    col += vec3(star * uStars * twinkle);

    // vignette
    vec2 q = vUv - 0.5;
    col *= 1.0 - dot(q, q) * 0.55;
    gl_FragColor = vec4(col, 1.0);
}
""") {
    val aPos = 0
    val aUv = 2
}

/** Infinite procedural floor grid. */
class GridProgram : Program("""
attribute vec3 aPos;
uniform mat4 uMVP;
uniform mat4 uModel;
varying vec3 vWorld;
void main() {
    vWorld = (uModel * vec4(aPos, 1.0)).xyz;
    gl_Position = uMVP * vec4(aPos, 1.0);
}
""", """
precision mediump float;
varying vec3 vWorld;
uniform float uSpacing;
uniform float uWidth;
uniform float uFade;
uniform float uAlpha;
uniform vec3 uColor;

float gridLine(vec2 p, float s, float w) {
    vec2 g = abs(fract(p / s - 0.5) - 0.5) * s;
    float d = min(g.x, g.y);
    return 1.0 - smoothstep(0.0, w, d);
}

void main() {
    float dist = length(vWorld.xz);
    float fade = 1.0 - smoothstep(uFade * 0.15, uFade, dist);
    float major = gridLine(vWorld.xz, uSpacing, uWidth);
    float minor = gridLine(vWorld.xz, uSpacing * 0.25, uWidth * 0.5) * 0.30;
    float a = max(major, minor) * fade * uAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
}
""") {
    val aPos = a("aPos")
}

/**
 * Final composite: renders the stereo framebuffer to the screen with Cardboard
 * barrel distortion, optional chromatic aberration and vignette.
 */
class BlitProgram : Program("""
attribute vec3 aPos;
attribute vec2 aUv;
varying vec2 vUv;
void main() {
    vUv = aUv;
    gl_Position = vec4(aPos.xy, 0.0, 1.0);
}
""", """
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uK1;
uniform float uK2;
uniform float uSwap;
uniform float uAberration;
uniform float uVignette;
uniform float uMono;

vec2 barrel(vec2 uv, float k1, float k2) {
    vec2 c = uv * 2.0 - 1.0;
    float r2 = dot(c, c);
    float f = 1.0 + k1 * r2 + k2 * r2 * r2;
    return c * f;
}

vec2 toSource(vec2 local, float eye, float k) {
    vec2 d = barrel(local, uK1 * k, uK2 * k);
    d = d * 0.5 + 0.5;
    return vec2(clamp(d.x, 0.0, 1.0) * 0.5 + eye * 0.5, clamp(d.y, 0.0, 1.0));
}

void main() {
    float eye = step(0.5, vUv.x);
    if (uSwap > 0.5) eye = 1.0 - eye;
    vec2 local = vec2(fract(vUv.x * 2.0), vUv.y);

    vec3 col;
    if (uAberration > 0.001) {
        float r = texture2D(uTex, toSource(local, eye, 1.0 - uAberration)).r;
        float g = texture2D(uTex, toSource(local, eye, 1.0)).g;
        float b = texture2D(uTex, toSource(local, eye, 1.0 + uAberration)).b;
        col = vec3(r, g, b);
    } else {
        col = texture2D(uTex, toSource(local, eye, 1.0)).rgb;
    }
    if (uMono > 0.5) {
        col = texture2D(uTex, toSource(local, 0.0, 1.0)).rgb;
    }

    vec2 q = local - 0.5;
    col *= 1.0 - dot(q, q) * uVignette;
    gl_FragColor = vec4(col, 1.0);
}
""") {
    val aPos = 0
    val aUv = 2
}

/** Holds every program used by the renderer. */
class Programs {

    lateinit var panel: PanelProgram
        private set
    lateinit var sprite: SpriteProgram
        private set
    lateinit var oes: OesProgram
        private set
    lateinit var lit: LitProgram
        private set
    lateinit var flat: FlatProgram
        private set
    lateinit var sky: SkyProgram
        private set
    lateinit var grid: GridProgram
        private set
    lateinit var blit: BlitProgram
        private set

    fun create() {
        panel = PanelProgram()
        sprite = SpriteProgram()
        oes = OesProgram()
        lit = LitProgram()
        flat = FlatProgram()
        sky = SkyProgram()
        grid = GridProgram()
        blit = BlitProgram()
    }

    fun release() {
        if (!::panel.isInitialized) return
        panel.release()
        sprite.release()
        oes.release()
        lit.release()
        flat.release()
        sky.release()
        grid.release()
        blit.release()
    }
}
