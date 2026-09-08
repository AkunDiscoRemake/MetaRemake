/**
 * Scene management (VR side).
 *
 * The JS runtime is the source of truth for what exists in the environment.
 * Nodes are described in a device-independent schema and pushed to the native
 * renderer, which draws them stereoscopically. `VR.scene` builds a "virtual
 * DOM" of nodes, diffs changes and synchronises with native each frame.
 *
 * Node schema (also documented in the Kotlin SceneGraph parser):
 *   { id, type: 'panel'|'box'|'sphere'|'quad'|'text',
 *     pos:[x,y,z], rot:[rx,ry,rz], scale:[sx,sy,sz],
 *     size:[w,h,d], color:[r,g,b,a], texture: 'camera'|'capture'|null,
 *     text: string, fontSize: number, visible: bool, pickable: bool,
 *     headLocked: bool, opacity: number }
 *
 * World convention (matches the native renderer): meters, +X right, +Y up,
 * -Z forward (head looks down -Z at rest). Node positions are world space and
 * stay fixed relative to the environment when the head turns.
 */
(function (global) {
  'use strict';
  var VR = global.VR;

  var nodes = Object.create(null);   // id -> node
  var dirty = false;
  var seq = 0;

  function defaults(over) {
    var n = {
      type: 'panel',
      pos: [0, 0, -2],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      size: [1, 1, 0.02],
      color: [0.9, 0.9, 0.9, 1],
      texture: null,
      text: null,
      fontSize: 0.06,
      visible: true,
      pickable: false,
      headLocked: false,
      opacity: 1
    };
    for (var k in over) n[k] = over[k];
    return n;
  }

  var api = {
    /** Add or replace a node. */
    add: function (over) {
      var node = defaults(over);
      if (!node.id) node.id = 'n' + (++seq);
      nodes[node.id] = node;
      dirty = true;
      return node;
    },
    /** Update fields of an existing node (merges). */
    update: function (id, patch) {
      var n = nodes[id];
      if (!n) return;
      for (var k in patch) n[k] = patch[k];
      dirty = true;
      return n;
    },
    get: function (id) { return nodes[id]; },
    remove: function (id) {
      if (nodes[id]) { delete nodes[id]; dirty = true; }
    },
    clear: function () {
      nodes = Object.create(null);
      dirty = true;
    },
    list: function () {
      var out = [], k;
      for (k in nodes) out.push(nodes[k]);
      return out;
    },
    count: function () { return Object.keys(nodes).length; },

    /** Push the current graph to native (full sync or upsert-only). */
    sync: function () {
      if (!dirty) return;
      var list = [];
      for (var k in nodes) list.push(nodes[k]);
      VR.native.setScene(list);
      dirty = false;
    },

    /**
     * World-space position a small distance `d` in front of the current head
     * orientation (used to re-anchor panels when the user recenters).
     */
    frontOfHead: function (d) {
      var pose = VR.head && VR.head.getPose();
      if (!pose) return [0, 0, -d];
      var m = pose.matrix || null;
      if (!m || m.length < 16) return [0, 0, -d];
      // Third column (forward axis) of the recentered head rotation matrix.
      var fx = m[2], fy = m[6], fz = m[10];
      return [fx * d, fy * d, fz * d];
    },

    /** Build a text panel node (VR UI label / button). */
    panel: function (over) {
      over = over || {};
      over.type = 'panel';
      return api.add(over);
    },
    text: function (id, text, pos, fontSize, color) {
      return api.add({
        id: id, type: 'text', text: text, pos: pos,
        size: [1.4, 0.2, 0.02], fontSize: fontSize || 0.06,
        color: color || [1, 1, 1, 1]
      });
    }
  };

  VR.scene = api;
})(window);
