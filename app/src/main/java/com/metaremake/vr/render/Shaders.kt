package com.metaremake.vr.render

/** GLSL sources for the runtime. */
object Shaders {

    const val COLOR_VERT = """
        uniform mat4 uMvp;
        attribute vec4 aPosition;
        attribute vec3 aNormal;
        attribute vec2 aUv;
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
            vUv = aUv;
            vNormal = aNormal;
            gl_Position = uMvp * aPosition;
        }
    """

    const val COLOR_FRAG = """
        precision mediump float;
        uniform vec4 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
            vec3 n = normalize(vNormal);
            float lambert = 0.55 + 0.45 * max(dot(n, normalize(vec3(0.3, 0.7, 0.6))), 0.0);
            gl_FragColor = vec4(uColor.rgb * lambert, uColor.a * uOpacity);
        }
    """

    const val TEX_VERT = """
        uniform mat4 uMvp;
        attribute vec4 aPosition;
        attribute vec3 aNormal;
        attribute vec2 aUv;
        varying vec2 vUv;
        void main() {
            vUv = aUv;
            gl_Position = uMvp * aPosition;
        }
    """

    const val TEX_FRAG = """
        precision mediump float;
        uniform sampler2D uTex;
        uniform vec4 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
            vec4 c = texture2D(uTex, vUv);
            gl_FragColor = vec4(c.rgb * uColor.rgb, c.a * uColor.a * uOpacity);
        }
    """

    const val EXTERNAL_VERT = TEX_VERT

    const val EXTERNAL_FRAG = """
        #extension GL_OES_EGL_image_external : require
        precision mediump float;
        uniform samplerExternalOES uTex;
        uniform vec4 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
            vec4 c = texture2D(uTex, vUv);
            gl_FragColor = vec4(c.rgb * uColor.rgb, uOpacity);
        }
    """

    /** Lens barrel-distortion correction (k = 0,0 -> identity blit). */
    const val DISTORT_VERT = """
        attribute vec4 aPosition;
        attribute vec2 aUv;
        varying vec2 vUv;
        void main() {
            vUv = aUv;
            gl_Position = aPosition;
        }
    """

    const val DISTORT_FRAG = """
        precision mediump float;
        uniform sampler2D uTex;
        uniform vec2 uLensCenter;
        uniform vec2 uScaleIn;
        uniform vec2 uScale;
        uniform vec2 uK;
        varying vec2 vUv;
        void main() {
            vec2 p = (vUv - uLensCenter) * uScaleIn;
            float r2 = dot(p, p);
            float r4 = r2 * r2;
            float d = 1.0 + uK.x * r2 + uK.y * r4;
            vec2 uv = uLensCenter + p * d * uScale;
            if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            } else {
                gl_FragColor = texture2D(uTex, uv);
            }
        }
    """

    /** Fullscreen quad for the distortion / blit pass. */
    fun fullscreenQuad(): FloatArray = floatArrayOf(
        -1f, -1f, 0f, 0f,
         1f, -1f, 1f, 0f,
         1f,  1f, 1f, 1f,
        -1f, -1f, 0f, 0f,
         1f,  1f, 1f, 1f,
        -1f,  1f, 0f, 1f
    )
}
