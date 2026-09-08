/**
 * VR UI widgets.
 *
 * Real spatial UI: every widget is a scene node (or a small group of nodes)
 * placed in world coordinates at a comfortable distance. Buttons are pickable
 * panels the pointer can hit-test; they emit `ui:click` events when activated
 * (pinch / tap / dwell / trigger).
 *
 * Layout helper: rows/cols arranged on a panel at a given world position.
 */
(function (global) {
  'use strict';
  var VR = global.VR;

  var clickTargets = Object.create(null); // node id -> handler
  var hoverTarget = null;

  function layoutGrid(basePos, cols, count, gap, cell) {
    var items = [];
    var rows = Math.ceil(count / cols);
    var w = cols * cell[0] + (cols - 1) * gap;
    var h = rows * cell[1] + (rows - 1) * gap;
    var startX = basePos[0] - w / 2 + cell[0] / 2;
    var startY = basePos[1] + h / 2 - cell[1] / 2;
    for (var i = 0; i < count; i++) {
      var r = Math.floor(i / cols);
      var c = i % cols;
      items.push({
        pos: [startX + c * (cell[0] + gap), startY - r * (cell[1] + gap), basePos[2]],
        size: cell
      });
    }
    return items;
  }

  function registerClick(node, handler) {
    node.pickable = true;
    clickTargets[node.id] = handler;
    return node;
  }

  function unregisterAll() {
    clickTargets = Object.create(null);
    hoverTarget = null;
  }

  function button(opts) {
    opts = opts || {};
    var w = opts.width || 0.36;
    var h = opts.height || 0.14;
    var node = VR.scene.add({
      id: opts.id,
      type: 'panel',
      pos: opts.pos,
      size: [w, h, 0.02],
      color: opts.color || [0.16, 0.2, 0.28, 1],
      pickable: true
    });
    if (opts.label) {
      VR.scene.add({
        id: (opts.id || 'btn') + '_label',
        type: 'text',
        text: opts.label,
        pos: [opts.pos[0], opts.pos[1] + h * 0.18, opts.pos[2] + 0.001],
        size: [w * 0.9, h * 0.7, 0.02],
        fontSize: opts.fontSize || h * 0.5,
        color: [1, 1, 1, 1]
      });
    }
    if (opts.onClick) registerClick(node, opts.onClick);
    return node;
  }

  function hover(node) {
    if (hoverTarget === node) return;
    if (hoverTarget) {
      var prev = hoverTarget;
      VR.scene.update(prev.id, { color: prev._baseColor || prev.color });
    }
    hoverTarget = node;
    if (node) {
      node._baseColor = node._baseColor || node.color.slice();
      VR.scene.update(node.id, { color: [node._baseColor[0] * 1.6, node._baseColor[1] * 1.6, node._baseColor[2] * 1.6, node._baseColor[3]] });
    }
  }

  /** Called each frame by the interaction layer with the current hit. */
  function updateHit(hit) {
    hover(hit ? hit.node : null);
  }

  /** Called when a click occurs at the pointer's current hit. */
  function clickAt(hit) {
    if (!hit || !hit.node) return false;
    var handler = clickTargets[hit.node.id];
    if (handler) {
      try { handler(hit.node); } catch (e) { VR.native.log('widget handler: ' + e.message); }
      VR.native.vibrate(12);
      return true;
    }
    return false;
  }

  VR.ui = {
    layoutGrid: layoutGrid,
    button: button,
    registerClick: registerClick,
    unregisterAll: unregisterAll,
    updateHit: updateHit,
    clickAt: clickAt,
    hoverTarget: function () { return hoverTarget; }
  };
})(window);
