/**
 * Hand state (JS view).
 *
 * Reads the continuous hand landmark stream produced by the native MediaPipe
 * Hand Landmarker integration. This is not gesture spotting: it maintains a
 * running model of each tracked hand (left/right, landmarks, confidence,
 * pointer tip, pinch, velocity) that the input layer turns into abstract
 * pointer events.
 */
(function (global) {
  'use strict';
  var VR = global.VR;

  var state = {
    hands: {},       // key: 'left'|'right' -> hand model
    frameTs: 0,
    lastUpdate: 0,
    tracking: false
  };

  function emptyHand() {
    return {
      hand: '', confidence: 0, pinch: 1, velocity: 0,
      pointer: [0.5, 0.5, 0], landmarks: null, lastSeen: 0
    };
  }

  var api = {
    poll: function () {
      var raw = VR.native.getHands();
      if (!raw) return state;
      var now = raw.ts || Date.now();
      state.frameTs = now;
      state.lastUpdate = now;
      var seen = {};
      for (var i = 0; i < raw.hands.length; i++) {
        var h = raw.hands[i];
        var key = h.hand || ('h' + i);
        seen[key] = true;
        var model = state.hands[key] || (state.hands[key] = emptyHand());
        model.hand = key;
        model.confidence = h.confidence || 0;
        model.pinch = h.pinch;
        model.velocity = h.velocity || 0;
        model.pointer = h.pointer || model.pointer;
        model.landmarks = h.landmarks || model.landmarks;
        model.lastSeen = now;
      }
      // Prune hands not seen recently.
      for (var k in state.hands) {
        if (!seen[k] && now - state.hands[k].lastSeen > 500) delete state.hands[k];
      }
      return state;
    },

    getState: function () { return state; },

    /** Primary pointer hand (prefer the right hand, then any). */
    primary: function () {
      var h = state.hands.right || state.hands.left;
      for (var k in state.hands) if (!h) h = state.hands[k];
      return h || null;
    },

    handCount: function () { return Object.keys(state.hands).length; }
  };

  VR.hands = api;
})(window);
