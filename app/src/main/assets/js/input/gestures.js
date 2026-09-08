/**
 * Gesture / global input handling (JS side).
 *
 * Maps the abstract input events onto app-level actions: back, menu, recenter,
 * select, click and text. Kept separate from the raw InputSystem so higher
 * layers can subscribe to semantic actions instead of device events.
 */
(function (global) {
  'use strict';
  var VR = global.VR;

  var state = {
    lastBack: 0,
    menuOpen: false
  };

  function onBack() {
    var now = Date.now();
    if (now - state.lastBack < 400) return; // debounce
    state.lastBack = now;
    if (VR.menus && VR.menus.isOpen()) {
      VR.menus.close();
    } else if (VR.browser && VR.browser.isActive()) {
      VR.browser.back();
    } else if (VR.apps && VR.apps.isActive()) {
      VR.apps.close();
    } else {
      VR.experiences && VR.experiences.openLauncher();
    }
  }

  function onMenu() {
    if (VR.menus) VR.menus.toggle();
  }

  function onRecenter() {
    VR.head.recenter();
    VR.events.emit('recenter');
  }

  function onSelect(e) {
    VR.events.emit('ui:select', e);
  }

  function onClick(e) {
    VR.events.emit('ui:click', e);
  }

  var api = {
    init: function () {
      VR.events.on('input:back', onBack);
      VR.events.on('input:menu', onMenu);
      VR.events.on('input:recenter', onRecenter);
      VR.events.on('input:select', onSelect);
      VR.events.on('input:click', onClick);
    },
    getState: function () { return state; }
  };

  VR.gestures = api;
})(window);
