/**
 * VR virtual keyboard.
 *
 * A spatial panel of keys for typing into the browser address bar (and any
 * future text field). Uses the same widget/click plumbing as every other VR
 * UI element. Emits `keyboard:key` events; the browser subscribes to them.
 */
(function (global) {
  'use strict';
  var VR = global.VR;

  var visible = false;
  var prefix = 'vrkbd';
  var ROWS = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '@'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '-', '_'],
    ['⌫', ' ', '⏎']
  ];

  var keyNodeIds = [];

  function keyHandler(ch) {
    return function () {
      VR.events.emit('keyboard:key', ch);
    };
  }

  function show(pos) {
    hide();
    pos = pos || [0, -0.9, -2.6];
    var gap = 0.02;
    var cell = [0.075, 0.075];
    var cols = 10;
    var y = pos[1];
    for (var r = 0; r < ROWS.length; r++) {
      var row = ROWS[r];
      var count = row.length;
      var isSpace = r === ROWS.length - 1;
      var w = isSpace ? 0.5 : cell[0];
      var x = pos[0] - (count * (cell[0] + gap) - gap) / 2 + w / 2;
      for (var c = 0; c < count; c++) {
        var ch = row[c];
        var id = prefix + '_k' + r + '_' + c;
        var node = VR.scene.add({
          id: id,
          type: 'panel',
          pos: [x + c * (cell[0] + gap) - (isSpace ? 0.25 : 0), y, pos[2]],
          size: isSpace ? [w, cell[1], 0.02] : [cell[0], cell[1], 0.02],
          color: (ch === '⌫' || ch === '⏎') ? [0.4, 0.2, 0.2, 1] : [0.12, 0.16, 0.22, 1],
          pickable: true
        });
        VR.scene.add({
          id: id + '_l',
          type: 'text',
          text: ch === ' ' ? 'SPACE' : ch,
          pos: [node.pos[0], node.pos[1] + 0.012, pos[2] + 0.001],
          size: [cell[0], cell[1], 0.02],
          fontSize: 0.045,
          color: [1, 1, 1, 1]
        });
        VR.ui.registerClick(node, keyHandler(ch));
        keyNodeIds.push(id);
      }
      y -= cell[1] + gap;
    }
    visible = true;
  }

  function hide() {
    for (var i = 0; i < keyNodeIds.length; i++) {
      VR.scene.remove(keyNodeIds[i]);
      VR.scene.remove(keyNodeIds[i] + '_l');
    }
    keyNodeIds = [];
    visible = false;
  }

  function isVisible() { return visible; }

  VR.keyboard = { show: show, hide: hide, isVisible: isVisible };
})(window);
