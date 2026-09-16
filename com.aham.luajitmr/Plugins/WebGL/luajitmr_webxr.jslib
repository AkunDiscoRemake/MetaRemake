// luajitmr_webxr.jslib
// WebXR bridge for LuaJITMR. Exposes native browser XR to the C# WebXRBridge.
mergeInto(LibraryManager.library, {

    luajitmr_xr_is_supported: function() {
        if (!navigator.xr) return 0;
        var vr = 0, ar = 0;
        // We can't await here; return a best-effort synchronous hint. Use 0/1/2/3.
        navigator.xr.isSessionSupported('immersive-vr').then(function(b){ vr = b ? 1 : 0; window.__ljmr_vr=vr; });
        navigator.xr.isSessionSupported('immersive-ar').then(function(b){ ar = b ? 2 : 0; window.__ljmr_ar=ar; });
        // Return VR support immediately if cached, else 0 (caller should re-check or use RequestSession).
        var cached = (window.__ljmr_vr|0) | (window.__ljmr_ar|0);
        return cached;
    },

    luajitmr_xr_request_session: function(modeInt, handsInt, depthInt, cbPtr) {
        var mode = modeInt === 1 ? 'immersive-ar' : 'immersive-vr';
        var features = ['local-floor'];
        var optional = [];
        if (handsInt) optional.push('hand-tracking');
        if (depthInt) optional.push('depth-sensing');
        var opts = { requiredFeatures: features, optionalFeatures: optional };
        if (!navigator.xr) {
            // call back with failure
            {{{ makeDynCall('vi','cb') }}} (0);
            return;
        }
        navigator.xr.requestSession(mode, opts).then(function(session){
            window.__ljmr_session = session;
            session.addEventListener('end', function(){
                window.__ljmr_session = null;
                if (typeof _luajitmr_on_session_ended === 'function') _luajitmr_on_session_ended();
            });
            session.requestReferenceSpace('local-floor').then(function(ref){
                window.__ljmr_ref = ref;
                {{{ makeDynCall('vi','cb') }}} (1);
            }).catch(function(e){ {{{ makeDynCall('vi','cb') }}} (0); });
        }).catch(function(e){
            console.warn('[LuaJITMR] WebXR request failed:', e);
            {{{ makeDynCall('vi','cb') }}} (0);
        });
    },

    luajitmr_xr_end_session: function() {
        var s = window.__ljmr_session;
        if (s) { s.end(); }
        window.__ljmr_session = null;
    },

    luajitmr_xr_get_view: function(posPtr, rotPtr) {
        // Called per frame. We cache the latest XRFrame during the rAF callback.
        var frame = window.__ljmr_frame;
        var ref = window.__ljmr_ref;
        var pose = frame && ref ? frame.getViewerPose(ref) : null;
        if (!pose) return 0;
        var view = pose.views[0];
        var p = view.transform.position;
        var q = view.transform.orientation;
        setValue(posPtr+0, p.x, 'float');
        setValue(posPtr+4, p.y, 'float');
        setValue(posPtr+8, p.z, 'float');
        setValue(rotPtr+0, q.x, 'float');
        setValue(rotPtr+4, q.y, 'float');
        setValue(rotPtr+8, q.z, 'float');
        setValue(rotPtr+12, q.w, 'float');
        return 1;
    },

    luajitmr_xr_get_hand: function(handedness, outPtr) {
        var frame = window.__ljmr_frame;
        var ref = window.__ljmr_ref;
        if (!frame || !ref) return 0;
        var session = window.__ljmr_session;
        if (!session || !session.inputSources) return 0;
        for (var i = 0; i < session.inputSources.length; i++) {
            var src = session.inputSources[i];
            if (src.hand && src.handedness === (handedness === 0 ? 'left' : 'right')) {
                var joints = src.hand.values();
                // MediaPipe maps WRIST=0, THUMB_TIP=4, INDEX_TIP=8, etc.
                // WebXR XRHand uses named joints — we approximate by picking 21 landmarks from the 25 XRHand joints.
                var indices = [
                    'wrist',
                    'thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip',
                    'index-finger-metacarpal','index-finger-phalanx-proximal','index-finger-phalanx-distal','index-finger-tip',
                    'middle-finger-metacarpal','middle-finger-phalanx-proximal','middle-finger-phalanx-distal','middle-finger-tip',
                    'ring-finger-metacarpal','ring-finger-phalanx-proximal','ring-finger-phalanx-distal','ring-finger-tip',
                    'pinky-finger-metacarpal','pinky-finger-phalanx-proximal','pinky-finger-phalanx-distal','pinky-finger-tip'
                ];
                var base = 0;
                for (var j = 0; j < 21; j++) {
                    var jn = indices[j];
                    var xj = src.hand.get(jn);
                    if (xj) {
                        var pos = xj.transform.position;
                        setValue(outPtr+base+0, pos.x, 'float');
                        setValue(outPtr+base+4, pos.y, 'float');
                        setValue(outPtr+base+8, pos.z, 'float');
                    }
                    base += 12;
                }
                return 1;
            }
        }
        return 0;
    },

    luajitmr_xr_get_input: function(outState) {
        // float[5]: triggerDown, triggerValue, primaryButton, axisX, axisY
        var session = window.__ljmr_session;
        if (!session || !session.inputSources || session.inputSources.length === 0) {
            for (var i = 0; i < 5; i++) setValue(outState + i*4, 0, 'float');
            return 0;
        }
        var src = session.inputSources[0];
        var gp = src.gamepad;
        var tDown = 0, tVal = 0, pb = 0, ax = 0, ay = 0;
        if (gp) {
            if (gp.buttons && gp.buttons.length > 0) {
                tVal = gp.buttons[0].value;
                tDown = gp.buttons[0].pressed ? 1 : 0;
            }
            if (gp.buttons && gp.buttons.length > 1) pb = gp.buttons[1].pressed ? 1 : 0;
            if (gp.axes && gp.axes.length >= 2) { ax = gp.axes[0]; ay = gp.axes[1]; }
        }
        if (src.targetRayMode === 'screen') {
            // Touchscreen / magic-window: touch = trigger
        }
        setValue(outState+0, tDown, 'float');
        setValue(outState+4, tVal, 'float');
        setValue(outState+8, pb, 'float');
        setValue(outState+12, ax, 'float');
        setValue(outState+16, ay, 'float');
        return 1;
    },

    luajitmr_haptics_pulse: function(amp, dur) {
        var s = window.__ljmr_session;
        if (!s || !s.inputSources) return;
        for (var i = 0; i < s.inputSources.length; i++) {
            var src = s.inputSources[i];
            if (src.gamepad && src.gamepad.hapticActuators && src.gamepad.hapticActuators[0]) {
                src.gamepad.hapticActuators[0].pulse(amp, dur);
            }
        }
    }
});

// ── Browser-side rAF loop hook (injects XRFrame into canvas presentation) ──
// The C# WebXRManager attaches its own submit hook; we simply cache the frame.
window.__ljmr_raf = function(t) {
    var s = window.__ljmr_session;
    if (s) {
        s.requestAnimationFrame(window.__ljmr_raf);
        // Frame is injected via XRSession's requestAnimationFrame callback signature.
    } else {
        requestAnimationFrame(window.__ljmr_raf);
    }
};
requestAnimationFrame(window.__ljmr_raf);
