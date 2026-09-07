/**
 * Vector icon set drawn straight into the panel canvas — no font, no image assets,
 * so the whole runtime stays offline-first and crisp at any stereo resolution.
 */


export const ICON_NAMES = ['home', 'store', 'globe', 'gear', 'hand', 'pinch', 'play', 'close', 'back', 'next', 'grid', 'search', 'plus', 'check', 'star', 'folder', 'music', 'video', 'vr', '360', 'camera', 'chat', 'game', 'code', 'paint', 'clock', 'wifi', 'refresh', 'power', 'cast', 'link', 'palette', 'sliders', 'pin', 'lock', 'eye', 'book', 'git', 'trash', 'keyboard', 'mic', 'volume', 'exit', 'desktop', 'wave', 'bolt', 'info', 'download', 'shield', 'layers', 'mouse', 'battery', 'up', 'down', 'pause', 'stop', 'settings'];
const KNOWN = new Set(ICON_NAMES);

export function drawIcon(ctx, name, x, y, s = 24, color = '#dff', { lw = 1.9, fill = false } = {}) {
  // Third-party apps often use an emoji / short glyph as their icon: render it as text.
  if (typeof name === 'string' && name.length && name.length <= 2 && !KNOWN.has(name)) {
    ctx.save();
    ctx.font = `${Math.round(s * 1.02)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",system-ui,sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(name, x, y + s * 0.04);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 24, s / 24);
  ctx.lineWidth = lw * (24 / s) * (s / 24);
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const P = (d) => ctx.fill(new Path2D(d));
  const S = (d) => ctx.stroke(new Path2D(d));
  ctx.transform(1, 0, 0, 1, -12, -12);
  switch (name) {
    case 'home': S('M3 11.5 12 4l9 7.5'); S('M5.5 10.5V20h13v-9.5'); S('M10 20v-5h4v5'); break;
    case 'store': case 'bag': S('M4.5 8h15l-1 11.5h-13z'); S('M8.5 8.5c0-3 1.5-4.5 3.5-4.5s3.5 1.5 3.5 4.5'); break;
    case 'globe': S('M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6z'); S('M3.4 12h17.2'); S('M12 3.2c2.6 2.4 3.9 5.4 3.9 8.8s-1.3 6.4-3.9 8.8c-2.6-2.4-3.9-5.4-3.9-8.8S9.4 5.6 12 3.2z'); break;
    case 'gear': case 'settings': S('M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z'); S('M12 2.6v2.4M12 19v2.4M4.8 4.8l1.7 1.7M17.5 17.5l1.7 1.7M2.6 12H5M19 12h2.4M4.8 19.2 6.5 17.5M17.5 6.5l1.7-1.7'); break;
    case 'hand': S('M8.5 12V5.6a1.4 1.4 0 0 1 2.8 0V11m0-1.2a1.4 1.4 0 0 1 2.8 0V12m0-1.6a1.4 1.4 0 0 1 2.8 0v4.2c0 3-2 5.4-5 5.4-2.4 0-3.8-1-5-2.6l-2.6-3.8a1.4 1.4 0 0 1 2.2-1.7L8.5 13'); break;
    case 'pinch': S('M9 6.5 12 3l3 3.5M12 3v9'); P('M12 15.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z'); break;
    case 'play': P('M8 5.4 18.5 12 8 18.6z'); break;
    case 'pause': S('M9.5 5.5v13M14.5 5.5v13'); break;
    case 'stop': P('M6.5 6.5h11v11h-11z'); break;
    case 'close': case 'x': S('M6 6 18 18M18 6 6 18'); break;
    case 'back': S('M15 5 8 12l7 7'); break;
    case 'fwd': case 'next': S('M9 5l7 7-7 7'); break;
    case 'up': S('M5 15l7-7 7 7'); break;
    case 'down': S('M5 9l7 7 7-7'); break;
    case 'grid': S('M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'); break;
    case 'search': S('M10.6 4.2a6.4 6.4 0 1 0 0 12.8 6.4 6.4 0 0 0 0-12.8z'); S('M15.4 15.4 20 20'); break;
    case 'plus': S('M12 5v14M5 12h14'); break;
    case 'minus': S('M5 12h14'); break;
    case 'check': S('M5 12.6 9.8 17.4 19 7'); break;
    case 'star': P('M12 3.4 14.6 9l6 .6-4.5 4 1.3 5.9L12 16.4 6.6 19.5 7.9 13.6l-4.5-4 6-.6z'); break;
    case 'folder': S('M3.5 7.5h6l2 2.5h9v10.5h-17z'); break;
    case 'music': S('M9 18V6.5l9-2V16'); P('M6.4 18.4a2.6 2.2 0 1 0 5.2 0 2.6 2.2 0 1 0-5.2 0z'); P('M15.4 16.4a2.6 2.2 0 1 0 5.2 0 2.6 2.2 0 1 0-5.2 0z'); break;
    case 'video': case 'vr': S('M3 7.5h11v9H3zM14 11l7-3.5v9L14 13z'); break;
    case '360': S('M12 5.5A6.5 6.5 0 1 1 5.5 12'); S('M8.6 3.4 5.6 5.5l3 2.1'); P('M12 9.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z'); break;
    case 'camera': S('M4 8.5h4l1.5-2.2h5L16 8.5h4v10.5H4z'); S('M12 10.6a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'); break;
    case 'chat': S('M4 5.5h16v11H9.5L5.5 20v-3.5H4z'); break;
    case 'game': S('M7 9h10a4 4 0 0 1 3.8 5l-.8 3.4a2.2 2.2 0 0 1-3.8.7L14.5 16h-5l-1.7 2.1a2.2 2.2 0 0 1-3.8-.7L3.2 14A4 4 0 0 1 7 9z'); S('M8 11.5v3M6.5 13h3M16 12h.01M18 14h.01'); break;
    case 'code': S('M9 7.5 4.5 12 9 16.5M15 7.5 19.5 12 15 16.5M13 5.5 11 18.5'); break;
    case 'paint': S('M6 3.5h11a2 2 0 0 1 0 4H9.5a2.5 2.5 0 0 0 0 5H13v3.5a2.5 2.5 0 0 1-5 0V15'); break;
    case 'clock': S('M12 3.4a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 0 0 0-17.2z'); S('M12 7.4V12l3.4 2.2'); break;
    case 'battery': S('M3 8.5h14.5v7H3zM19 10.8v2.4'); P('M5 10.5h8v3H5z'); break;
    case 'wifi': S('M4.5 9.5a10 10 0 0 1 15 0M7.4 12.6a6 6 0 0 1 9.2 0M10.4 15.7a2.3 2.3 0 0 1 3.2 0'); P('M12 18.6a1 1 0 1 0 .01 0z'); break;
    case 'refresh': S('M19 12a7 7 0 1 1-2.6-5.4'); S('M19.5 4.5V9H15'); break;
    case 'power': S('M12 3.6v7.2'); S('M7.4 6.6a6.6 6.6 0 1 0 9.2 0'); break;
    case 'cast': S('M3 6.5h18v11h-6.5'); P('M3 20.5a1.6 1.6 0 1 0 .01 0zM3 16.4a4 4 0 0 1 4 4M3 12.6a8 8 0 0 1 8 8'); break;
    case 'link': S('M10 14a4 4 0 0 1 0-5.6l2.4-2.4a4 4 0 0 1 5.6 5.6l-1 1'); S('M14 10a4 4 0 0 1 0 5.6L11.6 18a4 4 0 0 1-5.6-5.6l1-1'); break;
    case 'palette': S('M12 3.6a8.4 8.4 0 0 0 0 16.8c1.4 0 1.8-1 1.4-2-.5-1.3.4-2.4 1.8-2.4h2.2a3 3 0 0 0 3-3.4A8.5 8.5 0 0 0 12 3.6z'); P('M8 9.4a1.1 1.1 0 1 0 .01 0zM12.5 7.6a1.1 1.1 0 1 0 .01 0zM16.4 10a1.1 1.1 0 1 0 .01 0z'); break;
    case 'sliders': S('M5 7h14M5 12h14M5 17h14'); P('M9 7a1.8 1.8 0 1 0 .01 0zM15 12a1.8 1.8 0 1 0 .01 0zM8 17a1.8 1.8 0 1 0 .01 0z'); break;
    case 'pin': S('M9 3.5h6l-1 5 3.5 3v1.5H6.5V11.5L10 8.5z'); S('M12 13v7.5'); break;
    case 'lock': S('M6 11h12v9H6z'); S('M8.6 11V8.4a3.4 3.4 0 0 1 6.8 0V11'); break;
    case 'eye': S('M2.6 12S6 6.4 12 6.4 21.4 12 21.4 12 18 17.6 12 17.6 2.6 12 2.6 12z'); P('M12 9.9a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2z'); break;
    case 'book': S('M4 4.5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4z'); S('M20 4.5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z'); break;
    case 'git': S('M12 3.4v5.2M12 15.4v5.2'); P('M12 8.6a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8zM12 22.2a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z'); break;
    case 'trash': S('M5.5 7.5h13M9.5 7.5V5h5v2.5M7 7.5l.9 12.5h8.2L17 7.5'); break;
    case 'keyboard': S('M3 7h18v10H3z'); S('M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M6 13.8h12'); break;
    case 'mic': S('M12 4.2a2.6 2.6 0 0 1 2.6 2.6v4.4a2.6 2.6 0 0 1-5.2 0V6.8A2.6 2.6 0 0 1 12 4.2z'); S('M6.6 11.4a5.4 5.4 0 0 0 10.8 0M12 16.8V20'); break;
    case 'volume': S('M4 9.5h3.5L12 6v12L7.5 14.5H4z'); S('M15.4 9a4 4 0 0 1 0 6M18 6.8a7.4 7.4 0 0 1 0 10.4'); break;
    case 'exit': S('M14 4.5H5.5v15H14'); S('M11 12h9M16.5 8.5 20 12l-3.5 3.5'); break;
    case 'desktop': S('M3 5h18v11H3zM9 20h6M12 16v4'); break;
    case 'wave': S('M2.5 12c1.6 0 1.6-5 3.2-5s1.6 10 3.2 10 1.6-8 3.2-8 1.6 6 3.2 6 1.6-3 3.2-3h3.2'); break;
    case 'bolt': P('M13.5 2.5 6 13.4h4.4L9.8 21.5 18 10.2h-4.6z'); break;
    case 'info': S('M12 3.4a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 0 0 0-17.2z'); P('M12 10.4a1.2 1.2 0 1 0 .01 0zM10.9 13.4h2.2V17h-2.2z'); break;
    case 'download': S('M12 4v10M8 10.6 12 14.6l4-4M5 19h14'); break;
    case 'shield': S('M12 3.2 19 6v6.4c0 3.6-3 6-7 8-4-2-7-4.4-7-8V6z'); S('M9 12l2.2 2.2L15.4 10'); break;
    case 'layers': S('M12 3.5 3.5 8 12 12.5 20.5 8z'); S('M3.5 12 12 16.5 20.5 12M3.5 16 12 20.5 20.5 16'); break;
    case 'mouse': S('M12 3.6c3.4 0 5.4 2 5.4 5.4v6c0 3.4-2 5.4-5.4 5.4S6.6 18.4 6.6 15v-6C6.6 5.6 8.6 3.6 12 3.6z'); S('M12 7v3.4'); break;
    default: S('M12 3.4a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 0 0 0-17.2z');
  }
  ctx.restore();
}


