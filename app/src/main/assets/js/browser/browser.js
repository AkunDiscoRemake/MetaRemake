/**
 * VR browser.
 *
 * The browser is presented as a spatial VR surface (not a 2D activity). The
 * page content is launched through the system web browser and its screen is
 * captured back into the environment — the same authorized pipeline as any
 * other Android app — so the user gets real, full web rendering inside
 * Cardboard. A spatial address bar, navigation strip, bookmarks and tabs are
 * provided as VR UI; the virtual keyboard supplies text input.
 */
(function (global) {
  'use strict';
  var VR = global.VR;

  var state = {
    active: false,
    url: 'https://www.google.com',
    history: [],
    historyIndex: -1,
    favorites: VR.storage.get('favorites', []),
    tabs: [{ id: 't1', url: 'https://www.google.com', title: 'Nova aba' }],
    activeTab: 0
  };

  var surfaceId = 'browser_surface';
  var barId = 'browser_bar';
  var rootIds = [];
  var addressNode = null;

  function currentTab() { return state.tabs[state.activeTab]; }

  function buildUI() {
    clearUI();
    var pos = [0, 0.05, -2.2];
    var w = 1.9, h = 1.1;

    VR.scene.add({
      id: surfaceId, type: 'panel', pos: pos, size: [w, h, 0.02],
      texture: 'capture', color: [1, 1, 1, 1], pickable: false
    });
    rootIds.push(surfaceId);

    // Address bar.
    var barY = pos[1] + h / 2 + 0.14;
    VR.scene.add({
      id: barId, type: 'panel',
      pos: [pos[0], barY, pos[2]], size: [w * 0.72, 0.12, 0.02],
      color: [0.05, 0.07, 0.1, 1], pickable: true
    });
    rootIds.push(barId);
    addressNode = VR.scene.add({
      id: barId + '_text', type: 'text', text: currentTab().url,
      pos: [pos[0], barY + 0.012, pos[2] + 0.001],
      size: [w * 0.66, 0.1, 0.02], fontSize: 0.045, color: [0.85, 0.9, 0.95, 1]
    });
    rootIds.push(barId + '_text');
    VR.ui.registerClick(VR.scene.get(barId), function () {
      VR.keyboard.show([pos[0], pos[1] - 0.9, pos[2]]);
    });

    // Navigation buttons.
    var nav = [
      { id: 'b_back', label: '◀', onClick: function () { back(); } },
      { id: 'b_fwd', label: '▶', onClick: function () { forward(); } },
      { id: 'b_go', label: 'IR', onClick: function () { navigate(currentTab().url); VR.keyboard.hide(); } },
      { id: 'b_fav', label: '★', onClick: function () { toggleFavorite(); } },
      { id: 'b_new', label: '+', onClick: function () { newTab(); } },
      { id: 'b_close', label: '✕', onClick: function () { close(); } }
    ];
    var bw = 0.2;
    for (var i = 0; i < nav.length; i++) {
      var b = VR.ui.button({
        id: nav[i].id,
        pos: [pos[0] - w / 2 + bw / 2 + 0.05 + i * (bw + 0.05), pos[1] - h / 2 - 0.16, pos[2] + 0.002],
        width: bw, height: 0.16, label: nav[i].label, onClick: nav[i].onClick
      });
      rootIds.push(b.id); rootIds.push(b.id + '_label');
    }

    // Favorites strip.
    if (state.favorites.length) {
      var favY = barY + 0.2;
      var fw = 0.3;
      for (var j = 0; j < Math.min(state.favorites.length, 5); j++) {
        (function (fav) {
          var f = VR.ui.button({
            id: 'fav_' + j,
            pos: [pos[0] - w / 2 + fw / 2 + 0.05 + j * (fw + 0.05), favY, pos[2] + 0.002],
            width: fw, height: 0.1,
            label: fav.title ? fav.title.slice(0, 6) : fav.url.slice(0, 6),
            fontSize: 0.04,
            onClick: function () { navigate(fav.url); }
          });
          rootIds.push(f.id); rootIds.push(f.id + '_label');
        })(state.favorites[j]);
      }
    }

    state.active = true;
  }

  function clearUI() {
    for (var i = 0; i < rootIds.length; i++) VR.scene.remove(rootIds[i]);
    rootIds = [];
  }

  function navigate(url) {
    if (!url) return;
    url = normalize(url);
    currentTab().url = url;
    currentTab().title = url;
    state.history.push(url);
    state.historyIndex = state.history.length - 1;
    VR.native.launchUrl(url);
    VR.native.startScreenCapture();
    if (addressNode) VR.scene.update(addressNode.id, { text: url });
  }

  function normalize(url) {
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    return url;
  }

  function back() {
    if (state.historyIndex > 0) {
      state.historyIndex--;
      navigate(state.history[state.historyIndex]);
    }
  }

  function forward() {
    if (state.historyIndex < state.history.length - 1) {
      state.historyIndex++;
      navigate(state.history[state.historyIndex]);
    }
  }

  function toggleFavorite() {
    var url = currentTab().url;
    var idx = -1;
    for (var i = 0; i < state.favorites.length; i++) if (state.favorites[i].url === url) idx = i;
    if (idx >= 0) state.favorites.splice(idx, 1);
    else state.favorites.push({ url: url, title: currentTab().title });
    VR.storage.set('favorites', state.favorites);
    buildUI();
  }

  function newTab() {
    state.tabs.push({ id: 't' + (state.tabs.length + 1), url: 'https://www.google.com', title: 'Nova aba' });
    state.activeTab = state.tabs.length - 1;
    navigate('https://www.google.com');
  }

  function open(url) {
    state.active = true;
    navigate(url || 'https://www.google.com');
    buildUI();
  }

  function close() {
    clearUI();
    VR.keyboard.hide();
    VR.native.stopScreenCapture();
    state.active = false;
    VR.experiences.openLauncher();
  }

  function onKey(ch) {
    if (!state.active) return;
    var tab = currentTab();
    if (ch === '⌫') tab.url = tab.url.slice(0, -1);
    else if (ch === '⏎') { navigate(tab.url); VR.keyboard.hide(); }
    else tab.url += ch;
    if (addressNode) VR.scene.update(addressNode.id, { text: tab.url });
  }

  function handleClick(hit) {
    if (!state.active) return false;
    if (hit && hit.node && hit.node.id === surfaceId) {
      var lc = VR.pointer.localCoords(hit);
      VR.native.injectTap(lc.u, lc.v);
      return true;
    }
    return false;
  }

  function handleDrag(hit, dx, dy) {
    if (!state.active) return;
    if (hit && hit.node && hit.node.id === surfaceId) {
      var lc = VR.pointer.localCoords(hit);
      VR.native.injectSwipe(
        VR.clamp(lc.u - dx, 0, 1), VR.clamp(lc.v - dy, 0, 1), lc.u, lc.v
      );
    }
  }

  VR.browser = {
    open: open,
    close: close,
    back: back,
    forward: forward,
    navigate: navigate,
    isActive: function () { return state.active; },
    handleClick: handleClick,
    handleDrag: handleDrag,
    getState: function () { return state; }
  };

  VR.events.on('keyboard:key', onKey);
})(window);
