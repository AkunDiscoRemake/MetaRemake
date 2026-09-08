/**
 * VR pointer.
 *
 * Computes where the user is pointing in the environment and drives the
 * native cursor. Priority:
 *
 *   1. hand tracking pointer (index-finger tip -> head-space ray)
 *   2. native pointer snapshot (touch / gaze fallback)
 *
 * The result is a ray (origin + direction) used for 3D hit-testing against
 * pickable scene nodes, plus a normalized canvas position for the HUD.
 */
(function (global) {
  'use strict';
  var VR = global.VR;

  var ray = {
    origin: [0, 0, 0],
    direction: [0, 0, -1],
    nx: 0.5, ny: 0.5,        // normalized canvas position
    depth: 2.0,
    active: false,
    source: 'none'
  };

  var ASPECT = 1.777; // 16:9 estimate; corrected from the head unproject.

  function fromHandPointer(p) {
    // Landmark coords: x right (0..1), y down (0..1). Center is (0.5, 0.5).
    var nx = p[0], ny = p[1];
    var dir = VR.head.unproject(nx, ny, ASPECT);
    ray.direction = dir;
    ray.nx = nx; ray.ny = ny;
    ray.active = true;
    ray.source = 'hand';
  }

  function fromNativePointer(pt) {
    var dir = VR.head.unproject(pt.x, pt.y, ASPECT);
    ray.direction = dir;
    ray.nx = pt.x; ray.ny = pt.y;
    ray.active = !!pt.active;
    ray.source = pt.source || 'touch';
  }

  var api = {
    /** Update the pointer from the freshest input source. */
    update: function () {
      var hand = VR.hands.primary();
      if (hand && hand.confidence > 0.35) {
        fromHandPointer(hand.pointer);
      } else {
        var pt = VR.native.getPointer();
        if (pt.active) fromNativePointer(pt);
        else if (!ray.active) fromNativePointer({ x: 0.5, y: 0.5, active: true, source: 'gaze' });
      }
      ray.depth = VR.config.get('pointerDistance');
      VR.native.setCursor({
        dir: ray.direction,
        x: ray.nx, y: ray.ny,
        depth: ray.depth
      });
      return ray;
    },

    getRay: function () { return ray; },

    /**
     * Ray vs pickable panel in world space. Panels are axis-aligned quads;
     * returns { node, point, t } or null. Caller should only hit-test nodes
     * marked pickable (e.g. VR UI buttons).
     */
    hitTest: function (nodes) {
      if (!ray.active) return null;
      var best = null;
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (!n.visible || !n.pickable) continue;
        var p = n.pos, s = n.size;
        var hw = s[0] / 2, hh = s[1] / 2;
        var hit = rayQuad(ray.origin, ray.direction, p, hw, hh);
        if (hit && (!best || hit.t < best.t)) best = { node: n, point: hit.point, t: hit.t };
      }
      return best;
    }
  };

  function rayQuad(o, d, center, hw, hh) {
    // Panel plane z = center[2], bounds x in [cx-hw, cx+hw], y in [cy-hh, cy+hh].
    if (Math.abs(d[2]) < 1e-6) return null;
    var t = (center[2] - o[2]) / d[2];
    if (t <= 0) return null;
    var x = o[0] + d[0] * t;
    var y = o[1] + d[1] * t;
    if (x < center[0] - hw || x > center[0] + hw) return null;
    if (y < center[1] - hh || y > center[1] + hh) return null;
    return { t: t, point: [x, y, center[2]] };
  }

  /** Map a hit point on a panel to its local normalized (0..1) coords. */
  api.localCoords = function (hit) {
    var n = hit.node;
    var u = (hit.point[0] - (n.pos[0] - n.size[0] / 2)) / n.size[0];
    var v = 1 - (hit.point[1] - (n.pos[1] - n.size[1] / 2)) / n.size[1];
    return { u: VR.clamp(u, 0, 1), v: VR.clamp(v, 0, 1) };
  };

  VR.pointer = api;
})(window);
