import * as THREE from 'three';
import { settings } from '../core/settings.js';

/**
 * Head pose source. Prefers a real WebXR device pose, falls back to the phone's
 * gyroscope (DeviceOrientation) fused into a quaternion, and finally to mouse-drag
 * look so the runtime is testable on a laptop.
 *
 * The output is a quaternion + position applied to a camera rig, so the stereo
 * pipeline and hand overlay share one source of truth.
 */
export class HeadTracker {
  constructor() {
    this.quat = new THREE.Quaternion();
    this.target = new THREE.Quaternion();
    this.position = new THREE.Vector3();
    this.recenter = new THREE.Quaternion();
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.hasGyro = false;
    this.source = 'none';
    this.pointer = { x: 0, y: 0 };
    this.dragging = false;
    this.pitch = 0; this.yaw = 0;
    this.fov = 75;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._acc = new THREE.Vector3(1, 1, 1);
    this.motion = 0;
    this._lastAngle = 0;
  }

  attach(dom) {
    if (typeof DeviceOrientationEvent !== 'undefined') {
      window.addEventListener('deviceorientationabsolute', this._onOrient, true);
      window.addEventListener('deviceorientation', this._onOrient, true);
    }
    if (typeof DeviceMotionEvent !== 'undefined') window.addEventListener('devicemotion', this._onMotion, true);
    // Desktop / trackpad fallback
    dom.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') { this.dragging = true; } });
    window.addEventListener('pointerup', () => { this.dragging = false; });
    window.addEventListener('pointermove', (e) => {
      this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
      if (this.dragging && (settings.get('headSource') === 'mouse' || !this.hasGyro)) {
        this.yaw -= e.movementX * 0.0032;
        this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch - e.movementY * 0.0032));
      }
    });
    window.addEventListener('wheel', (e) => {
      if (!this.hasGyro) this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch - e.deltaY * 0.0007));
    }, { passive: true });
  }

  _onOrient = (ev) => {
    if (ev.alpha == null && ev.beta == null && ev.gamma == null) return;
    this.hasGyro = true;
    this.source = 'gyro';
    this._orient = ev;
  };

  _onMotion = (ev) => {
    const a = ev.accelerationIncludingGravity;
    if (a) this._acc.set(a.x ?? 1, a.y ?? 1, a.z ?? 1);
    const lin = ev.acceleration;
    if (lin) this.motion = Math.min(1, Math.hypot(lin.x ?? 0, lin.y ?? 0, lin.z ?? 0) * 0.5);
  };

  /** Request the iOS 13+ permission. Safe no-op elsewhere. */
  async requestPermission() {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      try { const r = await DOE.requestPermission(); return r === 'granted'; } catch { return false; }
    }
    return this.hasGyro;
  }

  /** Recenter: current view becomes "forward", the core comfort feature in a headset. */
  doRecenter() {
    this.recenter.copy(this.target).invert();
    if (this.source === 'gyro') this._baseline = this._angleFrom(this._orient);
  }

  _angleFrom(ev) {
    if (!ev) return this.yaw;
    const alpha = THREE.MathUtils.degToRad(ev.alpha || 0);
    const beta = THREE.MathUtils.degToRad(ev.beta || 0);
    const gamma = THREE.MathUtils.degToRad(ev.gamma || 0);
    const zee = new THREE.Vector3(0, 0, 1);
    const euler = new THREE.Euler();
    const q0 = new THREE.Quaternion();
    const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
    euler.set(beta, alpha, -gamma, 'YXZ');
    q0.setFromEuler(euler).multiply(new THREE.Quaternion().setFromAxisAngle(zee, -alpha));
    q0.multiply(q1);
    return q0;
  }

  /** Called every frame; returns smoothed orientation quaternion. */
  update(dt, xrQuat = null, xrPos = null) {
    const sens = settings.get('sensitivity');
    if (xrQuat) {
      this.source = 'xr';
      this.target.copy(xrQuat);
      if (xrPos) this.position.copy(xrPos);
    } else if (settings.get('headSource') !== 'mouse' && this.hasGyro && this._orient) {
      const q = this._angleFrom(this._orient);
      const zee = new THREE.Vector3(0, 0, 1);
      const alpha = THREE.MathUtils.degToRad(this._orient.alpha || 0);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(zee, -alpha));
      this.target.copy(q);
      // apply user invert flags in local space
      if (settings.get('invertPitch')) this.target.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI));
      if (settings.get('invertYaw')) this.target.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    } else {
      this.source = this.hasGyro ? 'gyro-idle' : 'mouse';
      const e = this.euler.set(this.pitch, this.yaw, 0, 'YXZ');
      this.target.setFromEuler(e);
    }
    // sensitivity scale (only meaningful for the fallback / gyro gain around identity)
    if (sens !== 1 && !xrQuat) {
      const from = new THREE.Quaternion();
      this.target.slerp(from, 1 - Math.min(2, sens));
    }
    this.target.premultiply(this.recenter);
    const k = 1 - Math.exp(-(xrQuat ? 26 : 18) * dt);
    this.quat.slerp(this.target, k);
    if (xrPos) this.position.lerp(xrPos, k);

    const angle = 2 * Math.acos(Math.min(1, Math.abs(this.quat.dot(this._prev || this.quat))));
    this._prev = this._prev ? this._prev.copy(this.quat) : this.quat.clone();
    this.motion = THREE.MathUtils.damp(this.motion, Math.min(1, angle * 6), 6, dt);
    return this.quat;
  }

  /** Forward unit vector, used for gaze ray + comfort logic. */
  forward(out = new THREE.Vector3()) {
    return out.set(0, 0, -1).applyQuaternion(this.quat);
  }
  up(out = new THREE.Vector3()) {
    return out.set(0, 1, 0).applyQuaternion(this.quat);
  }
}
