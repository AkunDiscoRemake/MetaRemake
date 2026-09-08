/**
 * Mixed Reality environment.
 *
 * The phone camera becomes the background of the VR scene (a large
 * 'camera'-textured panel a few meters ahead) while virtual objects stay
 * anchored in world space in front of it. Content remains stereoscopic: both
 * eyes see the camera background and the virtual objects with parallax.
 * Hand tracking runs over the camera feed, so the user can grab/pinch objects
 * against the real-world backdrop.
 */
(function (global) {
  'use strict';
  var VR = global.VR;

  var state = { active: false };
  var ids = ['mr_bg', 'mr_title', 'mr_obj1', 'mr_obj2', 'mr_obj3', 'mr_hint'];

  var OBJECTS = [
    { id: 'mr_obj1', pos: [-0.5, -0.1, -2.4], size: [0.3, 0.3, 0.3], color: [0.9, 0.35, 0.3, 1] },
    { id: 'mr_obj2', pos: [0.0, 0.1, -2.8], size: [0.35, 0.35, 0.35], color: [0.3, 0.55, 0.95, 1] },
    { id: 'mr_obj3', pos: [0.5, -0.1, -2.4], size: [0.3, 0.3, 0.3], color: [0.35, 0.85, 0.5, 1] }
  ];

  function open() {
    close();
    var d = VR.config.get('cameraDistance');
    VR.scene.add({
      id: 'mr_bg', type: 'panel',
      pos: [0, 0, -d], size: [6.5, 3.6, 0.02],
      texture: 'camera', color: [1, 1, 1, 1],
      opacity: VR.config.get('cameraOpacity')
    });
    VR.scene.add({
      id: 'mr_title', type: 'text', text: 'AMBIENTE MISTO (MR)',
      pos: [0, 1.55, -d], size: [2.2, 0.2, 0.02], fontSize: 0.12,
      color: [0.24, 0.86, 0.53, 1]
    });
    for (var i = 0; i < OBJECTS.length; i++) {
      var o = OBJECTS[i];
      VR.scene.add({
        id: o.id, type: 'box', pos: o.pos, size: o.size, color: o.color,
        pickable: true
      });
    }
    VR.scene.add({
      id: 'mr_hint', type: 'text',
      text: 'Aponte com o dedo e faça pinça para arrastar objetos. Palmas juntas = recentrar.',
      pos: [0, -1.5, -d], size: [2.6, 0.16, 0.02], fontSize: 0.055,
      color: [0.95, 0.95, 0.95, 1]
    });
    var back = VR.ui.button({
      id: 'mr_back', pos: [0, -1.95, -d], width: 0.8, height: 0.16,
      label: 'VOLTAR', color: [0.3, 0.2, 0.2, 1],
      onClick: function () { close(); }
    });
    ids.push(back.id); ids.push(back.id + '_label');

    VR.native.startCamera();
    if (VR.config.get('handTrackingEnabled')) VR.native.startHandTracking();
    state.active = true;
  }

  function close() {
    for (var i = 0; i < ids.length; i++) VR.scene.remove(ids[i]);
    VR.scene.remove('mr_back'); VR.scene.remove('mr_back_label');
    VR.native.stopCamera();
    state.active = false;
    VR.experiences.openLauncher();
  }

  /** Drag a virtual MR object with the hand pointer. */
  function handleDrag(hit) {
    if (!state.active) return false;
    if (hit && hit.node && hit.node.id && hit.node.id.indexOf('mr_obj') === 0) {
      var r = VR.pointer.getRay();
      var d = VR.config.get('cameraDistance');
      var t = Math.abs(d / r.direction[2]);
      var x = r.direction[0] * t;
      var y = r.direction[1] * t;
      VR.scene.update(hit.node.id, { pos: [x, y, -d + 0.05] });
      return true;
    }
    return false;
  }

  VR.mr = {
    open: open,
    close: close,
    handleDrag: handleDrag,
    isActive: function () { return state.active; }
  };
})(window);
