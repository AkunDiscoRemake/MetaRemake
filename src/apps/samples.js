export const SAMPLES = [
  {
    name: 'Olá, holograma',
    desc: 'Painel 3D com texto ao vivo e botão clicável com pinch.',
    code: `// MetaPort API · 1 — painel flutuante
const p = MetaPort.ui.panel({
  width: 0.78, x: 0, y: 0.15, z: -1.15, color: '#46f0d0',
  title: 'MEU PRIMEIRO APP'
});

let cliques = 0;
let t = 0;

p.draw((kit, panel) => {
  const W = panel.designW;
  kit.bg();
  kit.text('Olá, realidade mista!', 24, 60, { size: 30, weight: 800 });
  kit.text('Este painel é um objeto 3D: tem espessura, curvatura e brilho no ambiente.', 24, 104, { size: 13.5, color: '#a9c4de', maxWidth: W - 48 });
  kit.stat('s', 24, 150, 150, 74, { label: 'pinches', value: cliques, icon: 'pinch' });
  kit.progress(24, 250, W - 48, { value: (Math.sin(t * 1.6) + 1) / 2, label: 'pulso', color: '#ff3ea5' });
  kit.button('um', 24, 286, 150, 40, { label: 'clicou?', icon: 'check', variant: 'primary' });
});

p.onClick(({ region }) => {
  cliques++;
  MetaPort.audio.tone(660 + cliques * 40, 0.14);
  MetaPort.world.ping(0.8);
  MetaPort.haptic(22);
});

MetaPort.time.frame((dt) => { t += dt; });`
  },
  {
    name: 'Anel que segue a mão',
    desc: 'Gira e reage ao pinch — usa landmarks em coordenadas de mundo.',
    code: `// MetaPort API · 2 — gestos como input
const anel = MetaPort.scene.add({
  type: 'torus', size: 0.34, color: '#9be7ff', glow: 0.9, glass: true,
  pos: [0, 0.1, -1]
}).spin(0.2, 1.1, 0.4);

let apertado = 0;
MetaPort.on('pinch', (h) => { apertado = h && h.pinch ? 1 : 0; });

let scale = 1;
MetaPort.time.frame((dt) => {
  scale += (1 + apertado * 0.7 - scale) * 0.15;
  anel.scale.setScalar(scale);
  anel.material.emissiveIntensity = 0.3 + apertado * 1.6;
});`
  },
  {
    name: 'Poeira nos 21 pontos',
    desc: 'Materializa esferas em cada articulação detectada (esqueleto opcional).',
    code: `// MetaPort API · 3 — visão computacional sem assets
const V = MetaPort.math.V3();
const bolas = [];
for (let i = 0; i < 21; i++) {
  bolas.push(MetaPort.scene.add({ type: 'sphere', size: 0.026, color: i % 2 ? '#46f0d0' : '#ff3ea5', glow: 1.1, pos: [0, -9, 0] }));
}

MetaPort.time.frame(() => {
  const h = MetaPort.hands.primary();
  bolas.forEach((b, i) => {
    if (!h) { b.visible = false; return; }
    b.visible = true;
    const pt = MetaPort.hands.point(h, i);
    b.position.lerp(pt, 0.4);
    b.scale.setScalar(h.pinch ? 1.6 : 1);
  });
});`
  },
  {
    name: 'Piano no ar',
    desc: 'Seta de notas: a ponta do indicador toca; o pinch sustenta a nota.',
    code: `// MetaPort API · 4 — áudio espacial sintetizado
const notas = [60, 62, 64, 65, 67, 69, 71, 72];
let ultimo = -1, cd = 0;

MetaPort.ui.panel({ width: 0.9, z: -1.05, title: 'PIANO XR', draw: (kit, panel) => {
  kit.bg();
  const W = panel.designW, n = notas.length, bw = (W - 40) / n;
  notas.forEach((midi, i) => {
    const ativo = ultimo === i;
    kit.fillRR(20 + i * bw, 60, bw - 6, 150, 10, ativo ? '#46f0d0' : 'rgba(255,255,255,.06)', ativo ? '#eafffb' : 'rgba(150,205,255,.2)', 1);
    kit.text(['DÓ','RÉ','MI','FÁ','SOL','LÁ','SI','DÓ'][i], 20 + i * bw + (bw - 6) / 2, 230, { size: 12, align: 'center', color: '#8fb0cc' });
  });
  const h = MetaPort.hands.primary();
  kit.text(h ? \`ponta do dedo x=\${(h.pointer.x * 0.5 + 0.5).toFixed(2)} pinch=\${h.pinch}\` : 'mostre a mão para tocar', 20, 268, { size: 12, color: '#6e88a4' });
}, live: true });

MetaPort.time.frame((dt) => {
  cd -= dt;
  const h = MetaPort.hands.primary();
  if (!h || !h.point) return;
  const i = Math.max(0, Math.min(7, Math.floor((h.pointer.x * 0.5 + 0.5) * 8)));
  ultimo = i;
  if (cd <= 0) { MetaPort.audio.note(notas[i], 0.45, { gain: 0.12 }); cd = 0.26; }
});`
  },
  {
    name: 'Cronômetro Pomodoro',
    desc: 'widget de foco com persistência entre sessões.',
    code: `// MetaPort API · 5 — estado persistente
let fim = MetaPort.storage.get('fim') || 0;
let rodando = false;

const p = MetaPort.ui.panel({ width: 0.62, x: -0.55, y: 0.28, z: -0.95, color: '#ffc45e', title: 'FOCO 25′' });

function restante() { return rodando ? Math.max(0, fim - Date.now()) : 25 * 60000; }

p.draw((kit, panel) => {
  const W = panel.designW, s = restante() / 1000;
  kit.bg();
  kit.text(\`\${String(Math.floor(s / 60)).padStart(2,'0')}:\${String(Math.floor(s % 60)).padStart(2,'0')}\`, W / 2, 92, { size: 54, align: 'center', weight: 300, color: '#ffe0a3' });
  kit.progress(20, 132, W - 40, { value: 1 - restante() / (25 * 60000), color: '#ffc45e' });
  kit.button('go', 20, 158, W - 40, 42, { label: rodando ? 'pausar' : 'começar', icon: rodando ? 'pause' : 'play', variant: 'primary' });
});

p.onClick(({ region }) => {
  if (region.id !== 'go') return;
  rodando = !rodando;
  if (rodando) { fim = Date.now() + 25 * 60000; MetaPort.audio.ok(); }
  MetaPort.storage.set('fim', fim);
});

setInterval(() => { if (rodando && restante() <= 0) { rodando = false; MetaPort.audio.chord(60, 1.4, 'maj7'); MetaPort.ui.hud('tempo! levante, alongue, volte.'); } }, 500);`
  },
  {
    name: 'Mini jogo: pegue a esfera',
    desc: 'Objeto clicável com raycast do pinch, placar e partículas no mundo.',
    code: `// MetaPort API · 6 — gameplay espacial simples
let pontos = 0, vidas = 3;

function mover() {
  alvo.position.set((Math.random() - 0.5) * 1.5, (Math.random() - 0.2) * 0.8, -0.9 - Math.random() * 0.7);
  alvo.material.color.setHSL(Math.random(), 0.8, 0.6);
}
const alvo = MetaPort.scene.add({ type: 'sphere', size: 0.15, color: '#46f0d0', glow: 1.2, glass: true, pos: [0, 0.1, -1.1] });
alvo.float(0.05, 1.6).spin(0, 1.4, 0);
alvo.onClick(() => {
  pontos += 10; vidas -= 0;
  MetaPort.audio.tone(880 + pontos, 0.12, { pos: alvo.position });
  MetaPort.haptic(18);
  mover();
});

MetaPort.ui.panel({ width: 0.44, x: 0.66, y: 0.3, z: -1.0, color: '#ff3ea5', title: 'PLACAR', draw: (kit, panel) => {
  kit.bg();
  kit.stat('a', 14, 44, panel.designW - 28, 66, { label: 'pontos', value: pontos, icon: 'star', color: '#46f0d0' });
  kit.stat('b', 14, 120, panel.designW - 28, 66, { label: 'vidas', value: vidas, icon: 'shield', color: '#ff6b8a' });
  kit.text('pinche a esfera para marcar', 14, 206, { size: 11, color: '#6e88a4', maxWidth: panel.designW - 28 });
}, live: true });

MetaPort.time.every(4200, () => { vidas -= 1; mover(); if (vidas <= 0) { pontos = 0; vidas = 3; MetaPort.audio.error(); } });`
  },
  {
    name: 'Barra de status do sistema',
    desc: 'Lê telemetria do runtime (fps, mãos, modo) e desenha um HUD curvo.',
    code: `// MetaPort API · 7 — telemetria exposta para apps
const p = MetaPort.ui.panel({ width: 1.5, height: 0.12, y: -0.55, z: -1.32, color: '#8fd6ff', curve: 0.35, live: true });
let hist = [];
p.draw((kit, panel) => {
  const W = panel.designW, H = panel.designH;
  kit.bg();
  const info = MetaPort.xr.info();
  hist.push(info.fps); if (hist.length > 60) hist.shift();
  kit.spark(12, H - 44, W * 0.42, 34, hist, { min: 0, max: 120 });
  kit.text(\`\${info.fps} fps · \${info.res} · \${info.draws} draws · \${MetaPort.hands.count} mão(s) · \${MetaPort.xr.stereo ? 'SBS VR BOX' : 'MR'}\`, 12, 22, { size: 12, weight: 700, color: '#bfe9ff' });
});`
  }
];
