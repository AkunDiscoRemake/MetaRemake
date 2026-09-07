import { PALETTE } from '../ui/kit.js';

/**
 * App catalog. `system` apps ship installed; the rest are downloadable from the
 * Store (which also lists user apps made with the MetaPort Script API).
 */
const NATIVE = [
  {
    id: 'store', name: 'MetaPort Store', icon: 'store', color: '#46f0d0', category: 'sistema',
    tagline: 'Apps nativos, ports web e criações da API', system: true, size: 8_400_000, version: '1.0.0', author: 'MetaPort Team',
    desc: 'Loja do sistema. Instale apps 3D nativos, ports de web apps em formato desktop e publique seus próprios scripts da MetaPort API.',
    window: { width: 1.72, height: 1.06 }
  },
  {
    id: 'browser', name: 'Navegador MR', icon: 'globe', color: '#7ab8ff', category: 'sistema',
    tagline: 'Web em painéis holográficos', system: true, size: 3_100_000, version: '1.0.0', author: 'MetaPort Team',
    desc: 'Abas, histórico, favoritos e Reader3D nativo: a página é re-composta em cards 3D para funcionar também no modo VR Box estéreo. Em Realidade Mista (handheld) abre o site real sobre o ambiente.',
    window: { width: 1.8, height: 1.08 }
  },
  {
    id: 'settings', name: 'Ajustes', icon: 'gear', color: '#ff9d5c', category: 'sistema',
    tagline: 'VR Box, mãos, áudio, conforto', system: true, size: 1_200_000, version: '1.0.0', author: 'MetaPort Team',
    desc: 'Calibre IPD, separação das lentes, distorção, FOV, origem do raio, sensibilidade do pinch, passagem de câmera e tema do mundo.',
    window: { width: 1.5, height: 1.12 }
  },
  {
    id: 'studio', name: 'Studio & API', icon: 'code', color: '#c39bff', category: 'sistema',
    tagline: 'MetaPort Script API', system: true, size: 2_400_000, version: '1.0.0', author: 'MetaPort Team',
    desc: 'Editor embutido com exemplos comentados. Crie painéis, objetos 3D, sons, gestos e publique direto na Store.',
    window: { width: 1.86, height: 1.14 }
  },
  {
    id: 'player360', name: 'Vídeo 360°/SBS', icon: 'vr', color: '#ff6b9d', category: 'midia',
    tagline: 'Dome, esfera, 180° SBS, top-bottom', size: 1_900_000, version: '1.0.0', author: 'MetaPort Team',
    desc: 'Reprodutor imersivo: escolha arquivo do telefone ou URL, formato 360/180, layout SBS ou top-bottom e a curvatura da tela.',
    window: { width: 1.5, height: 0.9 }
  },
  {
    id: 'files', name: 'Galeria Espacial', icon: 'folder', color: '#ffd166', category: 'midia',
    tagline: 'Suas fotos flutuam na sala', size: 900_000, version: '1.0.0', author: 'MetaPort Team',
    desc: 'Selecione imagens e elas viram quadros holográficos posicionáveis na sua sala.',
    window: { width: 1.42, height: 0.92 }
  },
  {
    id: 'paint3d', name: 'Paint Volumétrico', icon: 'paint', color: '#69f0a5', category: 'criativo',
    tagline: 'Desenhe no ar com o pinch', size: 700_000, version: '1.0.0', author: 'MetaPort Team',
    desc: 'Pincéis de luz 3D: desenhe tubos no espaço com as mãos (ou mouse), troque cor/largura e salve no mundo.',
    window: { width: 1.32, height: 0.86 }
  },
  {
    id: 'piano', name: 'Piano XR', icon: 'music', color: '#9be7ff', category: 'musica',
    tagline: 'Toque com os dedos no ar', size: 1_100_000, version: '1.0.0', author: 'MetaPort Team',
    desc: 'Oitava flutuante com teclas 3D. Cada ponta de dedo pressionada gera nota com síntese FM e áudio espacial.',
    window: { width: 1.5, height: 0.8 }
  },
  {
    id: 'runner', name: 'Synth Runner', icon: 'game', color: '#ff3ea5', category: 'jogos',
    tagline: 'Corrida neon em túnel infinito', size: 2_200_000, version: '1.0.0', author: 'MetaPort Team',
    desc: 'Desvie dos prismas inclinando a cabeça ou movendo a mão. Velocidade progressiva, trilha procedural e ranking local.',
    window: { width: 1.28, height: 0.8 }
  },
  {
    id: 'clock', name: 'Relógio Orbital', icon: 'clock', color: '#8fd6ff', category: 'util',
    tagline: 'Horas, data e telemetria do headset', size: 400_000, version: '1.0.0', author: 'MetaPort Team',
    desc: 'Um orbe 3D com ponteiros volumétricos + telemetria (FPS, mãos, gyro, IPD) em painéis curvos.',
    window: { width: 1.2, height: 0.82 }
  },
  {
    id: 'docs', name: 'Docs MetaPort', icon: 'book', color: '#b6e3ff', category: 'sistema',
    tagline: 'Manual do usuário e atalhos', size: 300_000, version: '1.0.0', author: 'MetaPort Team',
    desc: 'Como calibrar o VR Box, mapeamento de gestos, atalhos de teclado e perguntas frequentes.',
    window: { width: 1.45, height: 1.0 }
  }
];

const PORTS = [
  {
    id: 'port-discord', name: 'Discord', icon: 'chat', color: '#8b9dff', category: 'port',
    tagline: 'Port web em forma de desktop', url: 'https://discord.com/app', size: 120_000, version: 'port-1', author: 'portado por MetaPort',
    desc: 'Chat de voz e texto dentro da sua sala. Abre o app web real sobre o ambiente em handheld/XR; no VR Box usa Reader3D + notificações no desktop holográfico.',
    window: { width: 1.62, height: 1.0 }, desktop: true
  },
  {
    id: 'port-whatsapp', name: 'WhatsApp Web', icon: 'link', color: '#6cf0a8', category: 'port',
    tagline: 'Conversas como janelas 3D', url: 'https://web.whatsapp.com', size: 90_000, version: 'port-1', author: 'portado por MetaPort',
    desc: 'Web app portado para o desktop espacial do MetaPort, com QR de pareamento visível no painel.',
    window: { width: 1.5, height: 1.02 }, desktop: true
  },
  {
    id: 'port-youtube', name: 'YouTube VR', icon: 'video', color: '#ff6b6b', category: 'port',
    tagline: 'Busca nativa + tela gigante', url: 'https://www.youtube.com', size: 140_000, version: 'port-1', author: 'portado por MetaPort',
    desc: 'Busca e resultados renderizados nativamente (Reader3D) e player em tela curva no modo handheld/XR.',
    window: { width: 1.72, height: 1.06 }, desktop: true, curved: true
  },
  {
    id: 'port-twitch', name: 'Twitch', icon: 'cast', color: '#b06bff', category: 'port',
    tagline: 'Lives no seu campo de visão', url: 'https://www.twitch.tv', size: 110_000, version: 'port-1', author: 'portado por MetaPort',
    desc: 'Diretos em painel curvo, chat lateral opcional.',
    window: { width: 1.7, height: 1.04 }, desktop: true
  },
  {
    id: 'port-x', name: 'X / Twitter', icon: 'wave', color: '#dfe8f5', category: 'port',
    tagline: 'Timeline em cards 3D', url: 'https://x.com', size: 80_000, version: 'port-1', author: 'portado por MetaPort',
    desc: 'Feed com cards flutuantes; funciona no VR Box via Reader3D.',
    window: { width: 1.38, height: 1.06 }, desktop: true
  },
  {
    id: 'port-reddit', name: 'Reddit', icon: 'layers', color: '#ff8a4c', category: 'port',
    tagline: 'Subreddits em prateleiras', url: 'https://www.reddit.com', size: 80_000, version: 'port-1', author: 'portado por MetaPort',
    desc: 'Explore comunidades: títulos e links re-compostos em painéis roláveis com o pinch.',
    window: { width: 1.46, height: 1.04 }, desktop: true
  },
  {
    id: 'port-maps', name: 'Mapas 3D', icon: 'globe', color: '#8fd6ff', category: 'port',
    tagline: 'OpenStreetMap na mesa', url: 'https://www.openstreetmap.org', size: 95_000, version: 'port-1', author: 'portado por MetaPort',
    desc: 'Mapa em plano horizontal (você olha de cima, como uma mesa de briefing).',
    window: { width: 1.55, height: 1.05 }, desktop: true, table: true
  },
  {
    id: 'port-github', name: 'GitHub', icon: 'git', color: '#c9d5e5', category: 'port',
    tagline: 'Repos e PRs no headset', url: 'https://github.com', size: 95_000, version: 'port-1', author: 'portado por MetaPort',
    desc: 'Leia issues e diffs em Reader3D, abra o site real em handheld.',
    window: { width: 1.5, height: 1.06 }, desktop: true
  }
];

export const APP_MODULES = {
  store: () => import('./store.js'),
  browser: () => import('./browser.js'),
  settings: () => import('./settingsApp.js'),
  studio: () => import('./studio.js'),
  player360: () => import('./player360.js'),
  files: () => import('./files.js'),
  paint3d: () => import('./paint3d.js'),
  piano: () => import('./piano.js'),
  runner: () => import('./runner.js'),
  clock: () => import('./clock.js'),
  docs: () => import('./docs.js'),
  launcher: () => import('./launcher.js')
};

export const PORT_IDS = PORTS.map((p) => p.id);

export const APPS = NATIVE.map((meta) => decorate(meta));
export const PORT_APPS = PORTS.map((meta) => decorate(meta, true));

function decorate(meta, isPort = false) {
  return {
    ...meta,
    isPort,
    color: meta.color || PALETTE.accent,
    async make(env) {
      if (isPort) {
        const mod = await import('./port.js');
        return mod.makePortController(meta, env);
      }
      const loader = APP_MODULES[meta.id];
      if (!loader) throw new Error(`módulo do app "${meta.id}" não encontrado`);
      const mod = await loader();
      return mod.make(env, meta);
    }
  };
}

export const CATEGORIES = [
  { id: 'todos', label: 'Todos' },
  { id: 'sistema', label: 'Sistema' },
  { id: 'port', label: 'Ports web' },
  { id: 'midia', label: 'Mídia' },
  { id: 'criativo', label: 'Criativo' },
  { id: 'musica', label: 'Música' },
  { id: 'jogos', label: 'Jogos' },
  { id: 'util', label: 'Utilidades' },
  { id: 'user', label: 'Da API' }
];

export const DEFAULT_INSTALLED = ['store', 'browser', 'settings', 'studio', 'docs', 'port-discord', 'port-youtube'];
