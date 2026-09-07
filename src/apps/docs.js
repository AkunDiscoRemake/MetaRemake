import { PALETTE, hexA, MONO } from '../ui/kit.js';
import { settings } from '../core/settings.js';
import { audio } from '../core/audio.js';
import { toast } from '../core/util.js';
import { API_VERSION } from '../core/api.js';

const SECTIONS = [
  {
    id: 'start', title: 'Primeiros 60 segundos', icon: 'bolt', body: [
      ['O que é isto', 'MetaPort é um runtime de realidade mista fanmade: em vez de um menu 2D, você está dentro de uma sala e todos os apps são objetos de vidro flutuando ao seu redor. Nada aqui é uma camada plana sobre a tela.'],
      ['Escolha o modo', '“Realidade Mista” usa a câmera do celular como passagem do mundo real atrás dos hologramas, com giroscópio para olhar em volta. “VR Box (SBS)” divide a tela em dois olhos com correção de lente — para encaixar o celular num headsets de papelão/VR Box.'],
      ['Controle sem toque', 'Ative o hand tracking, olhe para o painel e junte polegar+indicador (pinch) para clicar. Segurando o pinch você arrasta janelas e rola listas.'],
      ['Se perder', 'O trilho de sistema flutuando embaixo sempre tem Início, Voltar, Recentrar e Trocar modo.']
    ]
  },
  {
    id: 'vrbox', title: 'Configurando o VR Box', icon: 'vr', body: [
      ['1. Encaixe e brilho', 'Coloque o celular no headset com a tela voltada para as lentes, brilho no máximo e brilho automático desligado.'],
      ['2. Escolha o preset', 'Ajustes → Imagem & VR Box → presets. “VR Box 1ª geração” serve para a maioria dos aparelhos de plástico; “ZyberVR/BOBO” para lentes asféricas de 45-50mm.'],
      ['3. Distorção', 'As bordas devem ficar retas. Se a imagem “infla”, reduza Distorção de barril; se encolhe, aumente. Cada 0.1 muda bastante.'],
      ['4. IPD e separação', 'Mova IPD até o texto fundir em uma imagem só nitida. Separação das lentes controla o quanto os hologramas “saem” da tela.'],
      ['5. Recentre', 'Aponte para a frente e use Recentrar (tecla R ou o trilho de sistema). Isso vale também se a imagem “empinar” para um lado.'],
      ['Conforto', 'Vinheta de conforto em “auto” escurece as bordas quando você gira rápido. Reduza a Resolução interna se o fps cair abaixo de 45.']
    ]
  },
  {
    id: 'hands', title: 'Hand tracking (MediaPipe)', icon: 'hand', body: [
      ['Como funciona', 'O MetaPipe Hands roda no mesmo stream de vídeo usado pela passagem de câmera. Cada mão retorna 21 pontos; a partir deles calculamos pinça, preensão, apontar, mão aberta, sinal de paz e o contorno 3D.'],
      ['O contorno', 'Em Ajustes → Mãos & Gestos, o “Estilo do contorno” define o invólucro luminoso em volta da silhueta (contour/fit/aura). Ele é geometria real na cena, então tem paralaxe nos dois olhos — não é um desenho colado na tela.'],
      ['Clique por pinça', 'Sensibilidade do pinch: 0.30 é bom começo. Clique = juntar e soltar rápido. Segurar = arrastar.'],
      ['Sem mãos? Fallback', 'Se a câmera não vê mãos, o cursor passa a ser o olhar com dwell (tempo de fixação) configurável; toque na tela e mouse continuam funcionando.'],
      ['Dica de iluminação', 'Mãos aparecem melhor com a luz da sala atrás de você e a uns 40-70cm da câmera.']
    ]
  },
  {
    id: 'gestures', title: 'Mapa de gestos', icon: 'pinch', body: [
      ['Pinch (polegar+indicador)', 'Clicar/pressionar. Segure e mova para arrastar a janela pelo espaço ou rolar o conteúdo.'],
      ['Apontar (só indicador)', 'Move o cursor sem clicar — ideal para navegar antes de decidir.'],
      ['Mão aberta segurada', 'Início (fecha todos os apps).'],
      ['Dois dedos (paz) segurado', 'Voltar (fecha a janela em foco).'],
      ['Punho fechado + mover', 'Pegar e reposicionar a janela ativa.'],
      ['Duas mãos abrindo', 'Escala a janela focada (zoom espacial).'],
      ['Polegar para cima', 'Anel de janelas (alternar apps abertos).']
    ]
  },
  {
    id: 'apps', title: 'Apps do sistema', icon: 'grid', body: [
      ['MetaPort Store', 'Catálogo com apps 3D nativos, ports web e suas publicações da API. Instalar = registrar no launcher.'],
      ['Navegador MR', 'Abas, favoritos, histórico. Em handheld abre o site real projetado no plano 3D; no VR Box usa o Reader3D, que re-compõe o documento em blocos nativos (funciona em estéreo).'],
      ['Vídeo 360°/SBS', 'Escolha um arquivo .mp4/.webm: 360 mono/SBS/top-bottom, 180 SBS e tela curva. No estéreo o recorte por olho é automático.'],
      ['Piano XR / Paint / Runner / Galeria / Relógio', 'Brinquedos que mostram o que a engine faz: áudio espacial, geometria viva no mundo, entrada por cabeça e molduras holográficas.'],
      ['Ajustes', 'Tudo que a engine expõe: estéreo, lentes, mãos, áudio, tema, telemetria.']
    ]
  },
  {
    id: 'api', title: 'MetaPort Script API', icon: 'code', body: [
      ['Abrir o Studio', 'Início → Studio & API. Esquerda código, direita saída. “Executar” roda no mesmo instante; “Publicar na Store” transforma o script num app instalado, com ícone no launcher.'],
      ['O que dá pra fazer', 'MetaPort.ui.panel() cria painéis de vidro; MetaPort.scene.add() cria geometria real; MetaPort.hands dá as 21 articulações em coordenadas de mundo; MetaPort.audio sintetiza notas espacializadas; MetaPort.xr.info() expõe fps/resolução/modo.'],
      ['Ciclo de vida', 'Cada script roda num contexto rastreado: dor, timers e listeners criados por ele são destruídos quando o app fecha. Sem vazamento, sem global.'],
      ['Segurança', 'Scripts rodam locais e sem privilégios: não há acesso a arquivos nem rede além de fetch normal, e nada é enviado a servidores do MetaPort.']
    ]
  },
  {
    id: 'privacy', title: 'Privacidade e Android', icon: 'shield', body: [
      ['Sensores', 'Câmera e giroscópio só são pedidos depois do primeiro toque. Nenhum frame sai do aparelho: o MediaPipe roda 100% no dispositivo (WebGL/WASM).'],
      ['APK', 'O app Android é um wrapper WebView que serve os assets por origem segura (appassets.androidplatform.net) para que getUserMedia e WASM funcionem. Sem Play Store, sem telemetry, sem account.'],
      ['Permissões', 'CAMERA (opcional, para mãos/passthrough) e INTERNET (para os ports web). Nada de microfone ou localização.'],
      ['Compilação', 'push para o seu GitHub → Actions builda o APK debug e anexa na Release.']
    ]
  }
];

/** Manual nativo: paginado, rolável com pinch, dentro do mundo. */
export function make(env, meta) {
  const { panel } = env;
  const state = { sec: 0 };

  function draw(kit) {
    const r = env.window.content;
    kit.bg('default');
    let y = r.y;
    kit.tabs('dk:tab', r.x, y, r.w, { items: SECTIONS.map((s) => s.title.split(' ')[0]), current: state.sec, h: 30, size: 11 });
    y += 44;
    const sec = SECTIONS[state.sec];
    kit.text(sec.title.toUpperCase(), r.x + 4, y + 10, { size: 10.5, weight: 700, color: PALETTE.ink3, letterSpacing: 2 });
    y += 30;
    for (const [h, body] of sec.body) {
      kit.fillRR(r.x, y, r.w, 0, 0, 'transparent');
      kit.icon(sec.icon, r.x + 14, y + 12, 14, PALETTE.accent);
      kit.text(h, r.x + 34, y + 12, { size: 14, weight: 700 });
      const hh = kit.text(body, r.x + 34, y + 34, { size: 12.5, color: PALETTE.ink2, maxWidth: r.w - 60, lh: 1.55 });
      y += 34 + hh + 22;
    }
    y += 6;
    kit.divider(r.x, y, r.w, { label: 'ATALHOS DE TECLADO' });
    y += 20;
    const keys = [
      ['H', 'Início'], ['Esc', 'Voltar / fechar janela'], ['V', 'Alternar VR Box / MR'], ['R', 'Recentrar vista'],
      ['P', 'Passagem de câmera'], ['F', 'Hand tracking'], ['Tab', 'Janelas'], ['1..5', 'Loja, Navegador, Ajustes, Studio, Vídeo'], ['F1', 'Reabrir esta ajuda']
    ];
    keys.forEach(([k, desc], i) => {
      const yy = y + i * 24;
      kit.fillRR(r.x + 4, yy - 9, 44, 20, 6, 'rgba(255,255,255,.07)', 'rgba(150,205,255,.22)', 1);
      kit.text(k, r.x + 26, yy + 1, { size: 11, weight: 700, align: 'center', font: MONO });
      kit.text(desc, r.x + 60, yy + 1, { size: 12, color: PALETTE.ink2 });
    });
    y += keys.length * 24 + 20;
    if (sec.id === 'api') {
      kit.button('dk:apiweb', r.x + 4, y, Math.min(r.w - 8, 420), 44, { label: 'referência completa do SDK (web/docs.html)', icon: 'globe', variant: 'primary', size: 12 });
      kit.text('também disponível como texto puro em web/API.md — ótima no Reader3D', r.x + 4, y + 62, { size: 11, color: PALETTE.ink3, maxWidth: r.w - 10 });
      y += 84;
    }
    kit.text(`MetaPort 1.0.0 · API v${API_VERSION} · projeto fanmade, sem afiliação com Meta, Google, Samsung ou Discord.`, r.x + 4, y, { size: 11, color: PALETTE.ink3, maxWidth: r.w - 10 });
    y += 40;
    panel.contentH = y + 20;
    panel.maxScroll = Math.max(0, panel.contentH - panel.designH + 10);
  }

  function onClick(region) {
    if (region.id === 'dk:apiweb') {
      const url = new URL('web/docs.html', location.href).href;
      env.shell.openApp('browser', { nav: { url } });
      audio.swoosh(panel.worldPos);
      return;
    }
    if (region.id.startsWith('dk:tab:')) { state.sec = region.data.index; panel.scroll = 0; panel.markDirty(); audio.swoosh(panel.worldPos); }
  }

  return { draw, onClick };
}

export { SECTIONS as DOC_SECTIONS };
