/**
 * VR launcher + built-in experiences.
 *
 * The launcher is a stereoscopic, spatial interface: a curved row of panels
 * positioned in world space around the user. Every built-in experience reuses
 * the exact same VR runtime (head tracking, pointer, input, scene graph).
 */
(function (global) {
  'use strict';
  var VR = global.VR;

  var state = { current: 'launcher' };
  var ids = [];

  var ITEMS = [
    { id: 'exp_room', label: 'SALA VR', sub: 'sala imersiva', color: [0.24, 0.35, 0.55, 1], open: openRoom },
    { id: 'exp_viewer', label: 'VISUALIZADOR 3D', sub: 'objeto girando', color: [0.35, 0.25, 0.55, 1], open: openViewer },
    { id: 'exp_browser', label: 'NAVEGADOR', sub: 'web dentro do VR', color: [0.2, 0.45, 0.5, 1], open: function () { VR.browser.open(); } },
    { id: 'exp_images', label: 'IMAGENS', sub: 'galeria VR', color: [0.5, 0.4, 0.2, 1], open: openImages },
    { id: 'exp_mr', label: 'MODO MR', sub: 'realidade mista', color: [0.3, 0.5, 0.25, 1], open: function () { VR.mr.open(); } },
    { id: 'exp_hand', label: 'HAND TRACKING', sub: 'demonstração', color: [0.5, 0.25, 0.4, 1], open: openHandDemo },
    { id: 'exp_head', label: 'HEAD TRACKING', sub: 'demonstração', color: [0.25, 0.3, 0.5, 1], open: openHeadDemo },
    { id: 'exp_pointer', label: 'PONTEIRO', sub: 'demonstração', color: [0.2, 0.5, 0.45, 1], open: openPointerDemo },
    { id: 'exp_apps', label: 'APPS ANDROID', sub: 'painel de apps', color: [0.5, 0.35, 0.2, 1], open: openAppsPanel }
  ];

  var APPS = []; // filled lazily from native

  function clearAll() {
    for (var i = 0; i < ids.length; i++) VR.scene.remove(ids[i]);
    ids = [];
    VR.ui.unregisterAll();
    VR.menus.clear();
    VR.keyboard.hide();
  }

  function openLauncher() {
    clearAll();
    VR.native.stopScreenCapture();
    state.current = 'launcher';
    VR.scene.clear();

    VR.scene.add({
      id: 'launcher_bg', type: 'panel',
      pos: [0, 0, -4], size: [9, 5, 0.02], color: [0.03, 0.045, 0.07, 1]
    });
    ids.push('launcher_bg');

    VR.scene.add({
      id: 'launcher_title', type: 'text', text: 'META REMAKE',
      pos: [0, 1.7, -2.6], size: [2.4, 0.3, 0.02], fontSize: 0.16,
      color: [0.24, 0.86, 0.53, 1]
    });
    ids.push('launcher_title');

    // Curved launcher: items on an arc around the user.
    var n = ITEMS.length;
    var radius = 2.7;
    var span = Math.min(110, n * 24) * Math.PI / 180;
    var y = 0.25;
    for (var i = 0; i < n; i++) {
      var a = -span / 2 + (span * i) / Math.max(1, n - 1);
      var x = Math.sin(a) * radius;
      var z = -Math.cos(a) * radius;
      var item = ITEMS[i];
      var card = VR.scene.add({
        id: item.id, type: 'panel',
        pos: [x, y, z], rot: [0, a * 180 / Math.PI, 0],
        size: [0.52, 0.34, 0.02], color: item.color, pickable: true
      });
      ids.push(item.id);
      VR.scene.add({
        id: item.id + '_label', type: 'text', text: item.label,
        pos: [x, y + 0.04, z + 0.001], size: [0.46, 0.1, 0.02],
        fontSize: 0.045, color: [1, 1, 1, 1]
      });
      ids.push(item.id + '_label');
      VR.scene.add({
        id: item.id + '_sub', type: 'text', text: item.sub,
        pos: [x, y - 0.1, z + 0.001], size: [0.46, 0.07, 0.02],
        fontSize: 0.03, color: [0.7, 0.75, 0.8, 1]
      });
      ids.push(item.id + '_sub');
      VR.ui.registerClick(card, item.open);
    }

    // Bottom hint bar.
    VR.scene.add({
      id: 'launcher_hint', type: 'text',
      text: 'Olhe para um painel e clique (pinça / toque / botão). Menu: palma aberta. Recentrar: toque duplo.',
      pos: [0, -1.35, -2.6], size: [3.4, 0.12, 0.02], fontSize: 0.045,
      color: [0.6, 0.65, 0.7, 1]
    });
    ids.push('launcher_hint');
  }

  // --------------------------------------------------------------- experiences
  function openRoom() {
    clearAll();
    state.current = 'room';
    VR.scene.clear();

    // Floor + walls (boxes) form a room around the user.
    VR.scene.add({ id: 'rm_floor', type: 'box', pos: [0, -1.4, -2.5], size: [6, 0.1, 6], color: [0.14, 0.16, 0.2, 1] });
    VR.scene.add({ id: 'rm_wall_l', type: 'box', pos: [-3, 0.5, -2.5], size: [0.1, 3.6, 6], color: [0.1, 0.12, 0.16, 1] });
    VR.scene.add({ id: 'rm_wall_r', type: 'box', pos: [3, 0.5, -2.5], size: [0.1, 3.6, 6], color: [0.1, 0.12, 0.16, 1] });
    VR.scene.add({ id: 'rm_wall_f', type: 'box', pos: [0, 0.5, -5.5], size: [6, 3.6, 0.1], color: [0.09, 0.11, 0.15, 1] });
    VR.scene.add({ id: 'rm_ceiling', type: 'box', pos: [0, 2.3, -2.5], size: [6, 0.1, 6], color: [0.08, 0.1, 0.13, 1] });

    // Floating objects.
    VR.scene.add({ id: 'rm_cube', type: 'box', pos: [-0.8, 0.0, -2.6], size: [0.45, 0.45, 0.45], color: [0.9, 0.4, 0.3, 1], pickable: true });
    VR.scene.add({ id: 'rm_sphere', type: 'sphere', pos: [0.8, 0.1, -2.8], size: [0.25, 0.25, 0.25], color: [0.3, 0.6, 0.95, 1], pickable: true });
    VR.scene.add({ id: 'rm_panel', type: 'panel', pos: [0, 0.8, -2.4], size: [1.2, 0.4, 0.02], color: [0.2, 0.5, 0.4, 1] });
    VR.scene.add({ id: 'rm_panel_t', type: 'text', text: 'SALA VR', pos: [0, 0.82, -2.4], size: [1.1, 0.16, 0.02], fontSize: 0.09, color: [1, 1, 1, 1] });

    addBackButton([0, -1.15, -2.4]);
  }

  function openViewer() {
    clearAll();
    state.current = 'viewer';
    VR.scene.clear();
    VR.scene.add({ id: 'vw_obj', type: 'box', pos: [0, 0.15, -2.6], size: [0.6, 0.6, 0.6], color: [0.85, 0.45, 0.2, 1], pickable: true });
    VR.scene.add({ id: 'vw_title', type: 'text', text: 'VISUALIZADOR 3D', pos: [0, 1.1, -2.6], size: [1.8, 0.2, 0.02], fontSize: 0.1, color: [0.24, 0.86, 0.53, 1] });
    VR.scene.add({ id: 'vw_hint', type: 'text', text: 'Arraste para girar o objeto', pos: [0, -0.75, -2.6], size: [1.6, 0.12, 0.02], fontSize: 0.05, color: [0.8, 0.85, 0.9, 1] });
    VR.scene.add({ id: 'vw_spin', type: 'sphere', pos: [-0.9, 0.15, -2.6], size: [0.18, 0.18, 0.18], color: [0.4, 0.6, 0.9, 1], pickable: true });
    addBackButton([0, -1.15, -2.6]);
  }

  function openImages() {
    clearAll();
    state.current = 'images';
    VR.scene.clear();
    var cols = ['im1', 'im2', 'im3'];
    var colors = [[0.7, 0.3, 0.3, 1], [0.3, 0.6, 0.3, 1], [0.3, 0.4, 0.8, 1]];
    for (var i = 0; i < 3; i++) {
      var x = (i - 1) * 0.8;
      VR.scene.add({ id: cols[i], type: 'panel', pos: [x, 0.2, -2.6], size: [0.62, 0.7, 0.02], color: colors[i], pickable: true });
      VR.scene.add({ id: cols[i] + '_t', type: 'text', text: 'IMG ' + (i + 1), pos: [x, -0.3, -2.6], size: [0.5, 0.1, 0.02], fontSize: 0.05, color: [1, 1, 1, 1] });
    }
    VR.scene.add({ id: 'im_title', type: 'text', text: 'GALERIA VR', pos: [0, 1.1, -2.6], size: [1.6, 0.2, 0.02], fontSize: 0.1, color: [0.24, 0.86, 0.53, 1] });
    addBackButton([0, -1.15, -2.6]);
  }

  function openHandDemo() {
    clearAll();
    state.current = 'hand';
    VR.scene.clear();
    VR.native.startHandTracking();
    VR.native.setHandLandmarksVisible(true);
    VR.scene.add({ id: 'hd_title', type: 'text', text: 'HAND TRACKING', pos: [0, 1.2, -2.6], size: [1.8, 0.2, 0.02], fontSize: 0.1, color: [0.24, 0.86, 0.53, 1] });
    VR.scene.add({ id: 'hd_inst', type: 'text', text: 'Mova a mão diante da câmera: o indicador é o ponteiro. Pinça = clique. Palma aberta parada = menu.', pos: [0, -0.9, -2.6], size: [3.0, 0.2, 0.02], fontSize: 0.05, color: [0.85, 0.9, 0.95, 1] });
    VR.scene.add({ id: 'hd_target', type: 'panel', pos: [0, 0.1, -2.6], size: [0.5, 0.5, 0.02], color: [0.5, 0.3, 0.6, 1], pickable: true });
    VR.scene.add({ id: 'hd_target_t', type: 'text', text: 'ALVO', pos: [0, 0.13, -2.6], size: [0.4, 0.1, 0.02], fontSize: 0.06, color: [1, 1, 1, 1] });
    addBackButton([0, -1.5, -2.6]);
  }

  function openHeadDemo() {
    clearAll();
    state.current = 'head';
    VR.scene.clear();
    var refs = [];
    for (var i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2;
      var x = Math.sin(a) * 2.2;
      var z = -Math.cos(a) * 2.2;
      refs.push(VR.scene.add({
        id: 'hdm_' + i, type: 'panel',
        pos: [x, 0, z], rot: [0, a * 180 / Math.PI, 0],
        size: [0.4, 0.3, 0.02], color: [0.2, 0.4, 0.6, 1]
      }));
      VR.scene.add({
        id: 'hdm_' + i + '_t', type: 'text', text: String.fromCharCode(65 + i),
        pos: [x, 0.02, z + 0.001], size: [0.3, 0.14, 0.02], fontSize: 0.08, color: [1, 1, 1, 1]
      });
    }
    VR.scene.add({ id: 'hd_head', type: 'text', text: 'HEAD TRACKING', pos: [0, 1.3, -2.4], size: [1.8, 0.2, 0.02], fontSize: 0.1, color: [0.24, 0.86, 0.53, 1] });
    VR.scene.add({ id: 'hd_head2', type: 'text', text: 'Gire a cabeça e olhe ao redor. Os painéis permanecem fixos no espaço.', pos: [0, -1.2, -2.4], size: [3.0, 0.14, 0.02], fontSize: 0.05, color: [0.8, 0.85, 0.9, 1] });
    addBackButton([0, -1.6, -2.4]);
  }

  function openPointerDemo() {
    clearAll();
    state.current = 'pointer';
    VR.scene.clear();
    for (var r = 0; r < 3; r++) {
      for (var c = 0; c < 4; c++) {
        var x = (c - 1.5) * 0.42;
        var y = 0.9 - r * 0.45;
        (function (cid, px, py) {
          var cell = VR.scene.add({
            id: cid, type: 'panel',
            pos: [px, py, -2.5], size: [0.36, 0.36, 0.02],
            color: [0.15, 0.2, 0.3, 1], pickable: true
          });
          VR.ui.registerClick(cell, function (n) {
            VR.scene.update(n.id, { color: [0.24, 0.86, 0.53, 1] });
          });
        })('pd_' + r + '_' + c, x, y);
      }
    }
    VR.scene.add({ id: 'pd_title', type: 'text', text: 'DEMO DE PONTEIRO', pos: [0, 1.5, -2.5], size: [2.0, 0.2, 0.02], fontSize: 0.1, color: [0.24, 0.86, 0.53, 1] });
    VR.scene.add({ id: 'pd_hint', type: 'text', text: 'Aponte para um painel: ele acende. Clique para marcá-lo.', pos: [0, -1.3, -2.5], size: [2.4, 0.14, 0.02], fontSize: 0.05, color: [0.8, 0.85, 0.9, 1] });
    addBackButton([0, -1.7, -2.5]);
  }

  function openAppsPanel() {
    clearAll();
    state.current = 'apps';
    VR.scene.clear();
    APPS = VR.native.getInstalledApps().slice(0, 9);
    VR.scene.add({ id: 'ap_title', type: 'text', text: 'APPS ANDROID', pos: [0, 1.35, -2.5], size: [1.8, 0.2, 0.02], fontSize: 0.1, color: [0.24, 0.86, 0.53, 1] });
    if (!VR.native.isAccessibilityEnabled()) {
      VR.scene.add({
        id: 'ap_warn', type: 'text',
        text: 'Ative o serviço de acessibilidade para interagir com apps dentro do VR.',
        pos: [0, 0.95, -2.5], size: [2.6, 0.12, 0.02], fontSize: 0.045, color: [1, 0.7, 0.3, 1]
      });
      var enable = VR.ui.button({
        id: 'ap_enable', pos: [0, 0.7, -2.5], width: 0.9, height: 0.14,
        label: 'ATIVAR', color: [0.4, 0.3, 0.15, 1],
        onClick: function () { VR.native.openAccessibilitySettings(); }
      });
    }
    var cols = 3;
    for (var i = 0; i < APPS.length; i++) {
      (function (app) {
        var r = Math.floor(i / cols);
        var c = i % cols;
        var x = (c - 1) * 0.5;
        var y = 0.35 - r * 0.42;
        var card = VR.scene.add({
          id: 'app_card_' + i, type: 'panel',
          pos: [x, y, -2.5], size: [0.44, 0.34, 0.02],
          color: [0.14, 0.18, 0.26, 1], pickable: true
        });
        VR.scene.add({
          id: 'app_card_' + i + '_t', type: 'text',
          text: app.label.slice(0, 10), pos: [x, y + 0.02, -2.5 + 0.001],
          size: [0.4, 0.1, 0.02], fontSize: 0.04, color: [1, 1, 1, 1]
        });
        VR.ui.registerClick(card, function () { VR.apps.launch(app.package, app.label); });
      })(APPS[i]);
    }
    addBackButton([0, -1.6, -2.5]);
  }

  function addBackButton(pos) {
    var b = VR.ui.button({
      id: 'back_btn', pos: pos, width: 0.9, height: 0.16,
      label: 'VOLTAR', color: [0.3, 0.2, 0.2, 1],
      onClick: function () { openLauncher(); }
    });
    ids.push(b.id); ids.push(b.id + '_label');
  }

  /** Per-frame update for the current experience (animations etc.). */
  function update(t) {
    if (state.current === 'viewer') {
      var obj = VR.scene.get('vw_obj');
      if (obj) VR.scene.update('vw_obj', { rot: [obj.rot[0] + 0.4, obj.rot[1] + 0.8, obj.rot[2]] });
    } else if (state.current === 'room') {
      var cube = VR.scene.get('rm_cube');
      if (cube) VR.scene.update('rm_cube', { rot: [cube.rot[0] + 0.3, cube.rot[1] + 0.5, cube.rot[2]] });
    }
  }

  /** Drag routing for experiences that support it. */
  function handleDrag(hit, dx, dy) {
    if (state.current === 'viewer' && hit && hit.node) {
      var obj = VR.scene.get('vw_obj');
      if (obj && (hit.node.id === 'vw_obj' || hit.node.id === 'vw_spin')) {
        VR.scene.update('vw_obj', { rot: [obj.rot[0] + dy * 160, obj.rot[1] + dx * 160, obj.rot[2]] });
        return true;
      }
    }
    if (VR.mr.isActive()) return VR.mr.handleDrag(hit);
    return false;
  }

  VR.experiences = {
    openLauncher: openLauncher,
    update: update,
    handleDrag: handleDrag,
    getState: function () { return state; }
  };
})(window);
