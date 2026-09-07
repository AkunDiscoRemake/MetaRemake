import { settings } from './settings.js';
import { clamp } from './util.js';

/**
 * Spatial UI audio. Everything is synthesised (no assets to ship), positioned with
 * HRTF panners when the source's 3D position is known, so a click on a panel to the
 * left actually arrives at the left ear.
 */
class AudioEngine {
  constructor() {
    this.ctx = null; this.master = null; this.comp = null;
    this.ambientNodes = null;
    this.enabled = true;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch { this.ctx = new AC(); }
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18; this.comp.knee.value = 20; this.comp.ratio.value = 8;
    this.master = this.ctx.createGain();
    this.master.gain.value = settings.get('volume');
    this.master.connect(this.comp).connect(this.ctx.destination);
    settings.on('change', ({ key, value }) => { if (key === 'volume') this.master.gain.value = value; });
    this.startAmbient();
    return this.ctx;
  }

  get muted() { return !settings.get('sfx') || settings.get('volume') <= 0; }

  /** Positional blip. pos is a THREE.Vector3-ish in world space. */
  tone(freq, dur = 0.12, { type = 'sine', gain = 0.16, pos = null, detune = 0, glide = 0 } = {}) {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(30, freq), t);
    if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + glide), t + dur);
    if (detune) osc.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let tail = g;
    if (pos && settings.get('spatialAudio') && ctx.createPanner) {
      const p = ctx.createPanner();
      p.panningModel = settings.get('spatialAudio') === true ? 'HRTF' : 'equalpower';
      p.distanceModel = 'inverse'; p.refDistance = 1.2; p.rolloffFactor = 0.7;
      p.positionX && 'value' in p.positionX
        ? (p.positionX.value = pos.x, p.positionY.value = pos.y, p.positionZ.value = pos.z)
        : p.setPosition(pos.x, pos.y, pos.z);
      tail.connect(p).connect(this.master);
    } else tail.connect(this.master);
    osc.connect(g);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  noise(dur = 0.09, { gain = 0.08, hp = 900, pos = null } = {}) {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 1.5;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f).connect(g);
    if (pos && settings.get('spatialAudio') && ctx.createPanner) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.positionX && 'value' in p.positionX ? (p.positionX.value = pos.x, p.positionY.value = pos.y, p.positionZ.value = pos.z) : p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p).connect(this.master);
    } else g.connect(this.master);
    src.start();
  }

  // ---- semantic UI sounds ----
  hover(pos) { this.tone(880, 0.045, { type: 'triangle', gain: 0.05, pos }); }
  press(pos) { this.tone(520, 0.075, { type: 'sine', gain: 0.11, pos, glide: -120 }); this.noise(0.05, { gain: 0.035, hp: 2600, pos }); }
  release(pos) { this.tone(760, 0.06, { type: 'sine', gain: 0.07, pos, glide: 180 }); }
  toggle(on, pos) { this.tone(on ? 660 : 440, 0.1, { type: 'square', gain: 0.06, pos }); }
  open(pos) { this.tone(300, 0.22, { type: 'triangle', gain: 0.1, pos, glide: 520 }); }
  close(pos) { this.tone(760, 0.2, { type: 'triangle', gain: 0.08, pos, glide: -420 }); }
  error(pos) { this.tone(180, 0.24, { type: 'sawtooth', gain: 0.09, pos, glide: -60 }); }
  ok(pos) { this.tone(880, 0.1, { gain: 0.09, pos }); setTimeout(() => this.tone(1320, 0.14, { gain: 0.08, pos }), 90); }
  pinch(pos) { this.tone(1400, 0.05, { type: 'sine', gain: 0.06, pos }); }
  swoosh(pos) { this.noise(0.18, { gain: 0.05, hp: 500, pos }); }

  startAmbient() {
    const ctx = this.ensure();
    if (!ctx || this.ambientNodes) return;
    const g = ctx.createGain(); g.gain.value = 0;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 620;
    const freqs = [55, 82.5, 110, 164.8];
    const oscs = freqs.map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'sine' : 'triangle';
      o.frequency.value = f;
      o.detune.value = (i - 1.5) * 6;
      const og = ctx.createGain(); og.gain.value = 0.24 / (i + 1);
      o.connect(og).connect(filter);
      o.start();
      return o;
    });
    // slow shimmer
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
    const lg = ctx.createGain(); lg.gain.value = 120;
    lfo.connect(lg).connect(filter.frequency); lfo.start();
    filter.connect(g).connect(this.master);
    const target = () => (settings.get('ambient') && !settings.get('mutedFake')) ? 0.075 * clamp(settings.get('volume'), 0, 1) : 0;
    const ramp = () => g.gain.setTargetAtTime(target(), ctx.currentTime, 1.4);
    ramp();
    settings.on('change', ramp);
    this.ambientNodes = { g, oscs, lfo };
  }

  haptic(ms = 18) {
    if (!settings.get('haptics')) return;
    try { navigator.vibrate?.(ms); } catch { /* ignore */ }
    try { window.MPNative?.haptic?.(ms); } catch { /* ignore */ }
  }

  setListeningLevel(x) {
    if (!this.ctx) return;
    // duck the ambient pad while the user is interacting
    const g = this.ambientNodes?.g;
    if (g) g.gain.setTargetAtTime(x ? 0.03 : 0.075, this.ctx.currentTime, 0.4);
  }
}

export const audio = new AudioEngine();
