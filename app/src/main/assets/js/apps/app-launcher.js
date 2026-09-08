/**
 * Android-apps-inside-VR controller.
 *
 * Presents the user's real installed apps as a VR launcher. Launching an app:
 *
 *   1. startScreenCapture() -> MediaProjection permission (user grants)
 *   2. app is launched via its launcher intent
 *   3. the captured frame becomes a 'capture'-textured VR surface
 *   4. pointer events are mapped back to Android coordinates and injected
 *      through the authorized AccessibilityService
 *
 * No third-party app is modified, hooked or decompiled — only public,
 * user-authorized Android APIs are used.
 */
(function (global) {
  'use strict';
  var VR = global.VR;

  var state = {
    active: false,
    currentApp: null,
    surfaceNodeId: 'app_surface',
    captureStarted: false,
    waitingAccessibility: false
  };

  function install() {
    var pos = [0, 0, -2.2];
    var w = 1.6, h = 0.9;
    VR.scene.add({
      id: state.surfaceNodeId,
      type: 'panel',
      pos: pos,
      size: [w, h, 0.02],
      texture: 'capture',
      color: [1, 1, 1, 1],
      opacity: VR.config.get('captureOpacity'),
      pickable: false
    });
    VR.scene.add({
      id: 'app_title',
      type: 'text',
      text: state.currentApp ? state.currentApp.label : 'App',
      pos: [pos[0], pos[1] + h / 2 + 0.09, pos[2]],
      size: [w, 0.1, 0.02],
      fontSize: 0.06,
      color: [0.24, 0.86, 0.53, 1]
    });
    // Control strip (back / home / close).
    var bw = 0.34;
    var strip = [
      { id: 'app_back', label: 'VOLTAR', onClick: function () { VR.native.androidBack(); } },
      { id: 'app_home', label: 'HOME', onClick: function () { VR.native.androidHome(); } },
      { id: 'app_close', label: 'FECHAR', onClick: function () { close(); } }
    ];
    for (var i = 0; i < strip.length; i++) {
      var b = VR.ui.button({
        id: strip[i].id,
        pos: [pos[0] - w / 2 + bw / 2 + 0.05 + i * (bw + 0.08), pos[1] - h / 2 - 0.16, pos[2] + 0.002],
        width: bw, height: 0.16,
        label: strip[i].label,
        onClick: strip[i].onClick
      });
    }
    state.active = true;
  }

  function launch(pkg, label) {
    if (!VR.native.isAccessibilityEnabled()) {
      VR.native.log('accessibility disabled; prompt user');
      state.waitingAccessibility = true;
      VR.native.openAccessibilitySettings();
    }
    state.currentApp = { package: pkg, label: label };
    VR.native.launchApp(pkg);
    VR.native.startScreenCapture(); // triggers permission dialog
    install();
  }

  function close() {
    VR.native.stopScreenCapture();
    VR.scene.remove(state.surfaceNodeId);
    VR.scene.remove('app_title');
    VR.scene.remove('app_back'); VR.scene.remove('app_back_label');
    VR.scene.remove('app_home'); VR.scene.remove('app_home_label');
    VR.scene.remove('app_close'); VR.scene.remove('app_close_label');
    state.active = false;
    VR.experiences.openLauncher();
  }

  /** Map a pointer hit on the app surface to an Android tap. */
  function handleClick(hit) {
    if (!state.active) return false;
    if (hit && hit.node && hit.node.id === state.surfaceNodeId) {
      var lc = VR.pointer.localCoords(hit);
      VR.native.injectTap(lc.u, lc.v);
      return true;
    }
    return false;
  }

  function handleDrag(hit, dx, dy) {
    if (!state.active) return;
    if (hit && hit.node && hit.node.id === state.surfaceNodeId) {
      var lc = VR.pointer.localCoords(hit);
      VR.native.injectSwipe(
        VR.clamp(lc.u - dx, 0, 1), VR.clamp(lc.v - dy, 0, 1),
        lc.u, lc.v
      );
    }
  }

  VR.apps = {
    launch: launch,
    close: close,
    install: install,
    isActive: function () { return state.active; },
    handleClick: handleClick,
    handleDrag: handleDrag,
    getState: function () { return state; }
  };
})(window);
