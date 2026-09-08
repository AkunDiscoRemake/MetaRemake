/**
 * Main VR loop (JS side).
 *
 * `VR.tick()` is called by the native frame pacer once per rendered frame.
 * It keeps the JS logic tightly coupled to the render cadence while staying
 * allocation-light: poll inputs, update tracking, run the interaction layer,
 * update the current experience, sync the scene graph, update the HUD.
 */
(function (global) {
  'use strict';
  var VR = global.VR;

  var lastHit = null;
  var dragPending = null;

  function interactionStep() {
    // 1. Pointer (hand -> gaze/touch fallback) + hit testing.
    var ray = VR.pointer.update();
    var nodes = VR.scene.list();
    var hit = VR.pointer.hitTest(nodes);
    VR.ui.updateHit(hit);
    lastHit = hit;

    // 2. Raw clicks: dispatch to the currently-hovered widget.
    //    (Handled via ui:click, emitted by the native InputHub mapping.)
  }

  function onClick(e) {
    var hit = VR.pointer.hitTest(VR.scene.list());
    if (VR.browser.isActive() && VR.browser.handleClick(hit)) return;
    if (VR.apps.isActive() && VR.apps.handleClick(hit)) return;
    if (VR.ui.clickAt(hit)) return;
  }

  function onDrag(e) {
    var hit = VR.pointer.hitTest(VR.scene.list());
    if (VR.browser.isActive()) { VR.browser.handleDrag(hit, e.dx, e.dy); return; }
    if (VR.apps.isActive()) { VR.apps.handleDrag(hit, e.dx, e.dy); return; }
    if (VR.experiences.handleDrag(hit, e.dx, e.dy)) return;
  }

  function onScroll(e) {
    var hit = VR.pointer.hitTest(VR.scene.list());
    if (VR.browser.isActive() && hit && hit.node.id === 'browser_surface') {
      VR.native.injectSwipe(0.5, 0.7, 0.5, 0.7 + (e.dy > 0 ? -0.3 : 0.3));
    }
  }

  function hudStep() {
    var status = VR.native.getStatus();
    var pose = VR.head.getPose();
    var hands = VR.hands.getState();
    var n = hands ? Object.keys(hands.hands).length : 0;
    var hud = 'MetaRemake | ' + Math.round(status.fps || 0) + ' fps | ' +
      (pose.sensor || 'no sensor') +
      ' | yaw ' + Math.round(pose.yaw) + '° pitch ' + Math.round(pose.pitch) + '°' +
      (n ? ' | maos ' + n : '') +
      (status.capture ? ' | captura' : '');
    VR.native.setHud(hud);
  }

  var tickCount = 0;

  function tick() {
    tickCount++;
    // Poll head + hands + input (all cheap, no per-frame allocation on hot paths).
    VR.head.poll();
    if (VR.config.get('handTrackingEnabled')) VR.hands.poll();
    VR.input.poll();

    interactionStep();
    VR.experiences.update(tickCount);
    VR.scene.sync();

    if (tickCount % 30 === 0) hudStep();
  }

  // Wire input events to interaction handlers (semantic, device-agnostic).
  // Only the discrete 'click' event triggers activation; pointerdown/up are
  // used for drag tracking and cursor state on the native side.
  VR.events.on('input:click', onClick);
  VR.events.on('input:drag', onDrag);
  VR.events.on('input:scroll', onScroll);

  VR.tick = tick;
})(window);
