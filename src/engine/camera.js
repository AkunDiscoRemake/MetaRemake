import { Emitter } from '../core/util.js';
import { settings } from '../core/settings.js';

/**
 * Single camera owner. The same `<video>` element feeds both the MR passthrough
 * backdrop and MediaPipe hand tracking — on a phone you only get one stream, and in
 * a VR Box the lens points at the user's hands, so this design keeps both features
 * alive with a single permission.
 */
class CameraService extends Emitter {
  constructor() {
    super();
    this.video = document.createElement('video');
    Object.assign(this.video, { muted: true, playsInline: true, autoplay: true });
    this.video.setAttribute('playsinline', '');
    this.video.setAttribute('autoplay', '');
    this.stream = null;
    this.ready = false;
    this.error = null;
    this.mirror = false;
    this.luma = 0.5;
    this._probe = document.createElement('canvas');
    this._probe.width = 32; this._probe.height = 18;
    this._pctx = this._probe.getContext('2d', { willReadFrequently: true });
    this._timer = 0;
  }

  async start() {
    if (this.ready) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error = 'getUserMedia indisponível neste contexto';
      this.emit('error', this.error);
      return false;
    }
    const facing = settings.get('cameraFacing');
    this.mirror = facing === 'user';
    const tries = [
      { video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      { video: { facingMode: facing } },
      { video: true }
    ];
    for (const constraints of tries) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (e) { this.error = e?.name || String(e); }
    }
    if (!this.stream) {
      this.emit('error', this.error || 'permissão negada');
      return false;
    }
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});
    await new Promise((res) => {
      if (this.video.videoWidth) return res();
      this.video.addEventListener('loadedmetadata', res, { once: true });
      setTimeout(res, 3000);
    });
    this.ready = true;
    this.settings = this.stream.getVideoTracks()[0]?.getSettings?.() || {};
    this._timer = setInterval(() => this.sample(), 500);
    this.emit('ready', this);
    return true;
  }

  stop() {
    clearInterval(this._timer); this._timer = 0;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null; this.ready = false; this.video.srcObject = null;
    this.emit('stopped');
  }

  get width() { return this.video.videoWidth || 1280; }
  get height() { return this.video.videoHeight || 720; }
  get aspect() { return this.width / this.height; }

  /** Cheap ambient-lux estimate: drives auto exposure tint of the holograms. */
  sample() {
    if (!this.ready || this.video.readyState < 2) return;
    try {
      this._pctx.drawImage(this.video, 0, 0, 32, 18);
      const d = this._pctx.getImageData(0, 0, 32, 18).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += (d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114);
      this.luma = sum / (d.length / 4) / 255;
    } catch { /* tainted frame, ignore */ }
  }

  /** MediaPipe accepts the live element directly; this keeps detection in sync with display. */
  get source() { return this.video; }
}

export const camera = new CameraService();
