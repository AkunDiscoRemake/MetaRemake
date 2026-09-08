/**
 * MetaRemake — JS namespace + shared utilities.
 *
 * This is the root object of the VR runtime. Every module attaches itself to
 * `window.VR`. The native layer calls `VR.tick()` once per frame (defined in
 * vr/entry.js) and reads/writes state through `VR.native.*`.
 */
(function (global) {
  'use strict';

  var VR = {};
  global.VR = VR;

  VR.version = '1.0.0';

  // ------------------------------------------------------------------ events
  function EventEmitter() {
    this._listeners = Object.create(null);
  }
  EventEmitter.prototype.on = function (ev, fn) {
    (this._listeners[ev] = this._listeners[ev] || []).push(fn);
    return this;
  };
  EventEmitter.prototype.off = function (ev, fn) {
    var list = this._listeners[ev];
    if (!list) return this;
    var i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
    return this;
  };
  EventEmitter.prototype.emit = function (ev) {
    var list = this._listeners[ev];
    if (!list) return this;
    var args = Array.prototype.slice.call(arguments, 1);
    for (var i = 0; i < list.length; i++) {
      try { list[i].apply(null, args); } catch (e) { VR.native.log('emit(' + ev + '): ' + e.message); }
    }
    return this;
  };
  EventEmitter.prototype.removeAllListeners = function () { this._listeners = Object.create(null); };
  VR.EventEmitter = EventEmitter;
  VR.events = new EventEmitter(); // global bus

  // ------------------------------------------------------------------- math
  VR.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  VR.lerp = function (a, b, t) { return a + (b - a) * t; };
  VR.smoothstep = function (t) { t = VR.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  VR.deg2rad = function (d) { return d * Math.PI / 180; };
  VR.rad2deg = function (r) { return r * 180 / Math.PI; };
  VR.dist = function (a, b) {
    var dx = a[0] - b[0], dy = a[1] - b[1], dz = (a[2] || 0) - (b[2] || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };

  // ------------------------------------------------------------------ native
  var native = {
    call: function (fn) {
      var args = Array.prototype.slice.call(arguments, 1);
      try {
        if (global.NativeBridge && typeof global.NativeBridge[fn] === 'function') {
          return global.NativeBridge[fn].apply(global.NativeBridge, args);
        }
      } catch (e) { /* bridge not ready */ }
      return null;
    },
    json: function (fn) {
      var args = Array.prototype.slice.call(arguments, 1);
      var raw = native.call.apply(null, [fn].concat(args));
      if (raw == null) return null;
      if (typeof raw === 'object') return raw;
      try { return JSON.parse(raw); } catch (e) { return null; }
    },
    log: function (msg) { native.call('log', String(msg)); },
    getConfig: function () { return native.json('getConfig') || {}; },
    setConfig: function (patch) { return native.call('setConfig', JSON.stringify(patch)); },
    getHeadPose: function () { return native.json('getHeadPose') || null; },
    recenter: function () { native.call('recenter'); },
    getHands: function () { return native.json('getHands') || { hands: [], ts: 0 }; },
    startHandTracking: function () { return !!native.call('startHandTracking'); },
    stopHandTracking: function () { native.call('stopHandTracking'); },
    setHandLandmarksVisible: function (on) { native.call('setHandLandmarksVisible', !!on); },
    startCamera: function () { native.call('startCamera'); },
    stopCamera: function () { native.call('stopCamera'); },
    pollInput: function (max) { return native.json('pollInput', max || 64) || []; },
    getPointer: function () { return native.json('getPointer') || { x: 0.5, y: 0.5, active: false }; },
    setCursor: function (c) { native.call('setCursor', JSON.stringify(c)); },
    setScene: function (nodes) { native.call('setScene', JSON.stringify(nodes)); },
    upsertNode: function (node) { native.call('upsertNode', JSON.stringify(node)); },
    removeNodes: function (ids) { native.call('removeNodes', JSON.stringify(ids)); },
    clearScene: function () { native.call('clearScene'); },
    launchApp: function (pkg) { return native.json('launchApp', pkg); },
    launchUrl: function (url) { return native.json('launchUrl', url); },
    launchHome: function () { return native.json('launchHome'); },
    getInstalledApps: function () { return native.json('getInstalledApps') || []; },
    startScreenCapture: function () { native.call('startScreenCapture'); },
    stopScreenCapture: function () { native.call('stopScreenCapture'); },
    isAccessibilityEnabled: function () { return !!native.call('isAccessibilityEnabled'); },
    openAccessibilitySettings: function () { native.call('openAccessibilitySettings'); },
    injectTap: function (nx, ny) { native.call('injectTap', nx, ny); },
    injectSwipe: function (n1x, n1y, n2x, n2y) { native.call('injectSwipe', n1x, n1y, n2x, n2y); },
    androidBack: function () { native.call('androidBack'); },
    androidHome: function () { native.call('androidHome'); },
    getStatus: function () { return native.json('getStatus') || {}; },
    setHud: function (text) { native.call('setHud', String(text)); },
    vibrate: function (ms) { native.call('vibrate', ms | 0); }
  };
  VR.native = native;

  // Small local persistence (favorites, settings) via WebView localStorage.
  VR.storage = {
    get: function (key, def) {
      try { var v = global.localStorage.getItem('metaremake.' + key); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    set: function (key, val) {
      try { global.localStorage.setItem('metaremake.' + key, JSON.stringify(val)); } catch (e) {}
    }
  };
})(window);
