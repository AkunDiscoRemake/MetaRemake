/**
 * Runtime bootstrap.
 *
 * Executed once when the WebView loads. Boots the configuration, opens the VR
 * launcher and confirms readiness to the native layer (log).
 */
(function (global) {
  'use strict';
  var VR = global.VR;

  function boot() {
    VR.native.log('MetaRemake JS runtime ' + VR.version + ' booting');

    // Apply persisted configuration to the native renderer.
    VR.config.apply();

    // Gesture -> app action wiring.
    VR.gestures.init();

    // Open the Cardboard launcher (the stereoscopic home environment).
    VR.experiences.openLauncher();

    VR.native.log('runtime ready — ' + VR.scene.count() + ' scene nodes');
  }

  function onReady() {
    if (global.VR && VR.experiences) boot();
    else setTimeout(onReady, 50);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
})(window);
