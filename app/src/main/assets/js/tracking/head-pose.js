/**
 * Head pose (JS view).
 *
 * Reads the fused, filtered orientation from the native head tracker every
 * frame and exposes yaw/pitch/roll + the rotation matrix. The native side owns
 * the sensor fusion and the One Euro filtering; this module is a thin,
 * allocation-light projection of that state used by the interaction layer.
 */
(function (global) {
  'use strict';
  var VR = global.VR;

  var pose = {
    yaw: 0, pitch: 0, roll: 0,
    matrix: null,      // recentered head rotation (column-major 16)
    ready: false,
    sensor: 'none',
    ts: 0
  };

  var api = {
    /** Poll the latest head pose from native. Returns a cached object. */
    poll: function () {
      var raw = VR.native.getHeadPose();
      if (!raw) return pose;
      pose.yaw = raw.yaw || 0;
      pose.pitch = raw.pitch || 0;
      pose.roll = raw.roll || 0;
      pose.matrix = raw.matrix || pose.matrix;
      pose.ready = !!raw.ready;
      pose.sensor = raw.sensor || 'none';
      pose.ts = raw.ts || 0;
      return pose;
    },
    getPose: function () { return pose; },
    recenter: function () { VR.native.recenter(); },

    /** Gaze direction (head forward) as a unit vector in head space. */
    forward: function () {
      return [0, 0, -1];
    },

    /**
     * Convert a normalized pointer position (0..1, top-left origin) into a
     * head-space direction ray using the configured FOV and aspect ratio.
     */
    unproject: function (nx, ny, aspect) {
      var fov = VR.config.get('fovYDeg') * Math.PI / 180;
      var t = Math.tan(fov / 2);
      var x = (nx * 2 - 1) * t * aspect;
      var y = (1 - ny * 2) * t;
      var z = -1;
      var len = Math.sqrt(x * x + y * y + z * z);
      return [x / len, y / len, z / len];
    }
  };

  VR.head = api;
})(window);
