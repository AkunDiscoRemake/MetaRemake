/**
 * Unified input system (JS side).
 *
 * Drains the abstract event queue from the native InputHub (already normalized
 * across hand tracking, touch, Cardboard button, controller, keys and
 * accessibility) and dispatches them to the rest of the runtime through the
 * global event bus. Consumers never need to know which device produced an
 * event.
 */
(function (global) {
  'use strict';
  var VR = global.VR;

  var api = {
    /** Poll native input events and re-emit them on VR.events. */
    poll: function () {
      var events = VR.native.pollInput(128);
      for (var i = 0; i < events.length; i++) {
        var e = events[i];
        var type = e.type; // pointermove|pointerdown|pointerup|click|drag|scroll|back|select|recenter|trigger|menu|text
        VR.events.emit('input', e);
        VR.events.emit('input:' + type, e);
      }
      return events.length;
    },

    /** Current native pointer snapshot (position/down state). */
    pointer: function () {
      return VR.native.getPointer();
    }
  };

  VR.input = api;
})(window);
