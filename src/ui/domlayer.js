import * as THREE from 'three';
import { settings } from '../core/settings.js';

const LAYER_ID = 'dom-layer';

/**
 * DOM compositor. Real web content (the ported apps: Discord, WhatsApp, YouTube…)
 * and soft-keyboard text entry are *projected* onto panel planes with a matrix3d
 * that is derived from the same ViewProjection the WebGL pass uses — so the page
 * genuinely lies on the 3D slab, including its perspective.
 *
 * In SBS stereo a single DOM node cannot be shown to both eyes, so web content
 * falls back to Reader3D (native, stereo-correct) — see apps/reader.js.
 */
export class DomLayer {
  constructor(view, world) {
    this.view = view;
    this.world = world;
    this.el = document.getElementById(LAYER_ID);
    this.el.style.perspective = 'none';
    this.hosts = new Map();
    this.editor = null;
    this._m = new THREE.Matrix4();
    this._tmp = new THREE.Matrix4();
    view.onSize(() => { for (const h of this.hosts.values()) h.sync(); });
    settings.on('change', ({ key }) => { if (key === 'stereo' || key === 'mode') this.syncAll(); });
  }

  get allowDom() { return !this.view.stereo; }

  host(id, { w, h, kind = 'iframe' }) {
    let host = this.hosts.get(id);
    if (host) return host;
    const node = document.createElement('div');
    node.className = 'frame-host';
    node.style.width = `${w}px`;
    node.style.height = `${h}px`;
    node.style.pointerEvents = 'auto';
    const child = document.createElement(kind);
    if (kind === 'iframe') {
      child.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-presentation allow-downloads');
      child.setAttribute('allow', 'fullscreen; autoplay; encrypted-media; camera; microphone; geolocation; clipboard-read; clipboard-write');
      child.setAttribute('referrerpolicy', 'no-referrer');
    }
    node.appendChild(child);
    this.el.appendChild(node);
    host = {
      id, node, child, panel: null, rect: null, w, h, visible: true,
      setUrl(url) { child.src = url; },
      setParent(panel, rect) { host.panel = panel; host.rect = rect; },
      sync() { host.apply(); },
      apply() {
        if (!host.panel || !host.rect || !host.visible || !this.allowDom) { node.style.opacity = '0'; node.style.pointerEvents = 'none'; return; }
        const m = this.matrixFor(host.panel, host.rect, host.w, host.h);
        if (!m) { node.style.opacity = '0'; return; }
        node.style.transform = m;
        node.style.opacity = String(host.panel.alpha);
        node.style.pointerEvents = host.panel.alpha > 0.85 ? 'auto' : 'none';
      }
    };
    this.hosts.set(id, host);
    return host;
  }

  /**
   * matrix3d that maps the element's CSS pixels exactly onto a design-space rect of
   * a panel: local = (px·sx + ox, −py·sy + oy, z), then VP·panelWorld, then the NDC →
   * device-px affine. Perspective comes for free from the clip-space w.
   */
  matrixFor(panel, rect, elW, elH) {
    const cam = this.view.camera;
    if (!cam || !panel) return null;
    cam.updateMatrixWorld(true);
    panel.group.updateWorldMatrix(true, false);
    const W = this.view.width, H = this.view.height;
    const ux = panel.physW / panel.designW;
    const uy = panel.physH / panel.designH;
    const sx = (rect.w * ux) / elW;
    const sy = (rect.h * uy) / elH;
    const ox = (rect.x - panel.designW / 2) * ux;
    const oy = -(rect.y - panel.designH / 2) * uy;
    const M = new THREE.Matrix4().set(
      sx, 0, 0, ox,
      0, -sy, 0, oy,
      0, 0, 1, rect.z ?? 0.03
    );
    M.elements[15] = 1;
    const VP = this._m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const PM = this._tmp.multiplyMatrices(VP, panel.group.matrixWorld);
    const full = new THREE.Matrix4().multiplyMatrices(PM, M);
    const A = new THREE.Matrix4().set(
      0.5 * W, 0, 0, 0.5 * W,
      0, -0.5 * H, 0, 0.5 * H,
      0, 0, 1, 0,
      0, 0, 0, 1
    );
    full.premultiply(A);
    const e = full.elements.map((v) => (Math.abs(v) < 1e-7 ? 0 : +v.toFixed(6)));
    return `matrix3d(${e.join(',')})`;
  }

  update() { for (const h of this.hosts.values()) h.apply(); }
  syncAll() { this.update(); }

  hideAll() { for (const h of this.hosts.values()) { h.node.style.opacity = '0'; h.node.style.pointerEvents = 'none'; } }

  destroyHost(id) {
    const h = this.hosts.get(id);
    if (!h) return;
    h.node.remove();
    this.hosts.delete(id);
  }

  /** In-world text entry: a projected <input>/<textarea> so the phone keyboard works. */
  openEditor({ panel, rect, value = '', multiline = false, placeholder = '', onDone, onCancel }) {
    this.closeEditor();
    const node = document.createElement(multiline ? 'textarea' : 'input');
    node.className = 'mp-input';
    node.value = value;
    node.placeholder = placeholder;
    node.spellcheck = false;
    const elW = Math.max(160, rect.w * 0.5), elH = multiline ? Math.max(160, rect.h * 0.9) : Math.max(30, rect.h * 0.8);
    node.style.width = `${elW}px`;
    node.style.height = `${elH}px`;
    this.el.appendChild(node);
    const host = { node, panel, rect: { ...rect, w: rect.w }, elW, elH };
    const apply = () => {
      const m = this.matrixFor(panel, host.rect, elW, elH);
      node.style.transform = m || 'none';
      node.style.opacity = m ? '1' : '0';
    };
    this.editor = {
      node, apply,
      close: (commit) => {
        const v = node.value;
        this.editor = null;
        node.blur();
        node.remove();
        if (commit) onDone?.(v); else onCancel?.();
      }
    };
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) { e.preventDefault(); this.editor.close(true); }
      if (e.key === 'Escape') { e.preventDefault(); this.editor.close(false); }
      e.stopPropagation();
    }, true);
    node.addEventListener('input', apply);
    node.addEventListener('blur', () => { if (this.editor) this.editor.close(true); });
    setTimeout(() => { node.focus(); apply(); }, 30);
    return this.editor;
  }

  closeEditor(commit = false) { if (this.editor) this.editor.close(commit); }
}
