/**
 * VR menus.
 *
 * The quick-access system menu and the settings menu. Both are spatial panels
 * in world coordinates (head-height, a comfortable distance away) built from
 * the same widget system as the launcher.
 */
(function (global) {
  'use strict';
  var VR = global.VR;

  var open = false;
  var menuId = 'sysmenu';
  var nodeIds = [];

  function clearMenu() {
    for (var i = 0; i < nodeIds.length; i++) VR.scene.remove(nodeIds[i]);
    nodeIds = [];
  }

  function settingsMenu() {
    clearMenu();
    VR.ui.unregisterAll();
    VR.scene.remove(menuId);

    var pos = [0, 0.1, -2.4];
    var w = 1.6, h = 1.9;
    VR.scene.add({ id: menuId, type: 'panel', pos: pos, size: [w, h, 0.02], color: [0.06, 0.08, 0.12, 0.96] });
    nodeIds.push(menuId);
    VR.scene.add({ id: menuId + '_t', type: 'text', text: 'CONFIGURAÇÕES', pos: [pos[0], pos[1] + h / 2 - 0.12, pos[2] + 0.001], size: [w, 0.12, 0.02], fontSize: 0.08, color: [0.24, 0.86, 0.53, 1] });
    nodeIds.push(menuId + '_t');

    var rows = [
      ['IPD: ', 'ipdMeters', 0.058, 0.072, 0.001, 'm'],
      ['FOV: ', 'fovYDeg', 70, 110, 5, '°'],
      ['Escala: ', 'renderScale', 0.5, 1.5, 0.25, ''],
      ['FPS alvo: ', 'targetFps', 30, 90, 30, ''],
      ['Distância do menu: ', 'menuDistance', 1.5, 4, 0.25, 'm']
    ];
    var y = pos[1] + h / 2 - 0.32;
    for (var r = 0; r < rows.length; r++) {
      var spec = rows[r];
      var label = spec[0], key = spec[1], lo = spec[2], hi = spec[3], step = spec[4], unit = spec[5];
      addSlider(label, key, lo, hi, step, unit, [pos[0], y, pos[2] + 0.002]);
      y -= 0.22;
    }

    // Hand tracking toggle
    var htLabel = 'Rastreamento de mãos';
    var htNode = VR.ui.button({
      id: 'cfg_hand', pos: [pos[0], y, pos[2] + 0.002],
      width: 1.3, height: 0.14,
      label: htLabel + (VR.config.get('handTrackingEnabled') ? ': LIGADO' : ': DESLIGADO'),
      color: [0.2, 0.3, 0.2, 1],
      onClick: function () {
        var on = !VR.config.get('handTrackingEnabled');
        VR.config.set('handTrackingEnabled', on);
        if (on) VR.native.startHandTracking(); else VR.native.stopHandTracking();
        settingsMenu();
      }
    });
    nodeIds.push(htNode.id); nodeIds.push(htNode.id + '_label');
    y -= 0.2;

    // Distortion toggle
    var distNode = VR.ui.button({
      id: 'cfg_dist', pos: [pos[0], y, pos[2] + 0.002],
      width: 1.3, height: 0.14,
      label: 'Correção de lente: ' + (VR.config.get('distortionEnabled') ? 'LIGADA' : 'DESLIGADA'),
      color: [0.2, 0.25, 0.35, 1],
      onClick: function () {
        VR.config.set('distortionEnabled', !VR.config.get('distortionEnabled'));
        settingsMenu();
      }
    });
    nodeIds.push(distNode.id); nodeIds.push(distNode.id + '_label');
    y -= 0.2;

    // Back button
    var back = VR.ui.button({
      id: 'cfg_back', pos: [pos[0], y, pos[2] + 0.002],
      width: 0.9, height: 0.14, label: 'VOLTAR', color: [0.3, 0.2, 0.2, 1],
      onClick: function () { VR.experiences.openLauncher(); }
    });
    nodeIds.push(back.id); nodeIds.push(back.id + '_label');

    open = true;
  }

  function addSlider(label, key, lo, hi, step, unit, pos) {
    var val = VR.config.get(key);
    var minus = VR.ui.button({
      id: 'sl_' + key + '_m', pos: [pos[0] - 0.55, pos[1], pos[2]],
      width: 0.18, height: 0.16, label: '-', color: [0.25, 0.15, 0.15, 1],
      onClick: function () {
        VR.config.set(key, VR.clamp(val - step, lo, hi));
        settingsMenu();
      }
    });
    var plus = VR.ui.button({
      id: 'sl_' + key + '_p', pos: [pos[0] + 0.55, pos[1], pos[2]],
      width: 0.18, height: 0.16, label: '+', color: [0.15, 0.3, 0.18, 1],
      onClick: function () {
        VR.config.set(key, VR.clamp(val + step, lo, hi));
        settingsMenu();
      }
    });
    var valueText = label + val.toFixed(3) + unit;
    var lbl = VR.scene.add({
      id: 'sl_' + key + '_l', type: 'text', text: valueText,
      pos: [pos[0], pos[1] + 0.001, pos[2]],
      size: [0.85, 0.12, 0.02], fontSize: 0.05, color: [0.9, 0.9, 0.9, 1]
    });
    nodeIds.push(minus.id); nodeIds.push(minus.id + '_label');
    nodeIds.push(plus.id); nodeIds.push(plus.id + '_label');
    nodeIds.push(lbl.id);
  }

  function quickMenu() {
    clearMenu();
    VR.ui.unregisterAll();
    VR.scene.remove(menuId);

    var pos = [0, 0.05, -2.4];
    var w = 1.3, h = 0.9;
    VR.scene.add({ id: menuId, type: 'panel', pos: pos, size: [w, h, 0.02], color: [0.06, 0.08, 0.12, 0.96] });
    nodeIds.push(menuId);

    var items = [
      { id: 'qm_recenter', label: 'RECENTRAR', onClick: function () { VR.head.recenter(); close(); } },
      { id: 'qm_config', label: 'CONFIGURAÇÕES', onClick: function () { settingsMenu(); } },
      { id: 'qm_launcher', label: 'INÍCIO', onClick: function () { VR.experiences.openLauncher(); } }
    ];
    for (var i = 0; i < items.length; i++) {
      var b = VR.ui.button({
        id: items[i].id, pos: [pos[0], pos[1] + h / 2 - 0.22 - i * 0.24, pos[2] + 0.002],
        width: 1.0, height: 0.16, label: items[i].label, onClick: items[i].onClick
      });
      nodeIds.push(b.id); nodeIds.push(b.id + '_label');
    }
    open = true;
  }

  function toggle() {
    if (open) close();
    else quickMenu();
  }

  function close() {
    clearMenu();
    VR.scene.remove(menuId);
    open = false;
  }

  function isOpen() { return open; }

  VR.menus = {
    toggle: toggle,
    open: quickMenu,
    settings: settingsMenu,
    close: close,
    isOpen: isOpen,
    clear: clearMenu
  };
})(window);
