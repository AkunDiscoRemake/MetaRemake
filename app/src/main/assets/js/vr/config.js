/**
 * VR configuration — the single source of truth for runtime settings on the
 * JS side. Loaded from the native layer on boot; changes are applied via
 * `apply()` and persisted locally.
 */
(function (global) {
  'use strict';
  var VR = global.VR;

  var DEFAULTS = {
    // Stereo
    ipdMeters: 0.063,
    fovYDeg: 90,
    // Quality / performance
    renderScale: 1.0,
    targetFps: 60,
    distortionEnabled: true,
    distortionK1: 0.22,
    distortionK2: 0.24,
    // Environment
    worldScale: 1.0,
    panelDistance: 2.0,
    menuDistance: 2.4,
    near: 0.1,
    far: 120,
    // Cursor / interaction
    cursorEnabled: true,
    pointerDistance: 2.0,
    // Mixed reality
    cameraOpacity: 1.0,
    cameraDistance: 4.0,
    // Android app surface
    captureOpacity: 1.0,
    // Hand tracking
    handTrackingEnabled: false,
    showHandLandmarks: false
  };

  var config = VR.storage.get('config', null) || {};

  function merged() {
    var out = {};
    var k;
    for (k in DEFAULTS) out[k] = DEFAULTS[k];
    for (k in config) out[k] = config[k];
    return out;
  }

  var cfg = merged();

  var api = {
    get: function (key) { return cfg[key]; },
    getAll: function () { return JSON.parse(JSON.stringify(cfg)); },
    set: function (key, value) {
      if (!(key in DEFAULTS)) return;
      cfg[key] = value;
      VR.storage.set('config', cfg);
      api.apply();
    },
    patch: function (obj) {
      for (var k in obj) {
        if (k in DEFAULTS) cfg[k] = obj[k];
      }
      VR.storage.set('config', cfg);
      api.apply();
    },
    reset: function () {
      cfg = merged();
      VR.storage.set('config', cfg);
      api.apply();
    },

    /** Push the JS config into the native renderer. */
    apply: function () {
      VR.native.setConfig({
        ipdMeters: cfg.ipdMeters,
        fovYDeg: cfg.fovYDeg,
        renderScale: cfg.renderScale,
        targetFps: cfg.targetFps,
        distortionEnabled: cfg.distortionEnabled,
        distortionK1: cfg.distortionK1,
        distortionK2: cfg.distortionK2,
        worldScale: cfg.worldScale,
        near: cfg.near,
        far: cfg.far,
        cameraOpacity: cfg.cameraOpacity,
        captureOpacity: cfg.captureOpacity,
        showHud: cfg.showHud !== false,
        showHandLandmarks: cfg.showHandLandmarks
      });
      VR.native.setHandLandmarksVisible(cfg.showHandLandmarks);
      VR.events.emit('config:changed', cfg);
    }
  };

  VR.config = api;
})(window);
