## MetaPort (fanmade)

Realidade mista no celular — sem óculos caro, sem app nativo de terceiros:

- **Modo VR Box** com estéreo side-by-side, lentes corrigidas (barrel + cromático),
  IPD e curvatura ajustáveis, máscara de olhos e *vignette* de conforto.
- **Passthrough de verdade**: a câmera do celular vira a parede do mundo 3D; UI e
  janelas ficam no espaço, nada de menu 2D.
- **Hand tracking por MediaPipe** com **contorno luminoso em volta da mão** (não
  esqueleto) + **pinch para clicar**, arrastar, rolar, ✌️ voltar, palma aberta = home.
- **MetaPort Store** com apps nativos (Navegador, Configurações, Arquivos, Studio,
  Player 360, Paint 3D, Piano, Corrida, Relógio, Docs) e **ports web em janela**
  (Discord, WhatsApp, YouTube, Wikipedia…).
- **API própria** (`window.MetaPort`) para criar apps em JS puro e publicá-los na
  loja — referência dentro do app em *Docs → API* e em `public/web/API.md`.

## Instalar

1. Baixe o `MetaPort-debug*.apk` (desta release ou do artefato do workflow).
2. No Android: *Configurações → Apps → instalar apps desconhecidos* para o navegador
  /arquivos, depois abra o APK. Requer Android 8.0+ (API 26) e WebView atualizado.
3. Aceite o pedido de **câmera** (passthrough + mãos). Sem câmera, tudo continua
   funcionando em modo mono.
4. Para óculos VR Box: aperte **VR Box**, encaixe o celular, ajuste IPD em
   *Configurações → Óculos*, e recentre o olhar com `R`.

## Notas

- APK `release` gerado por CI vem assinado com a **debug key** quando não há
  `METAPORT_KEYSTORE_B64` no repositório — bom para sideload, não para a Play Store.
- O bundle é 100% offline (o modelo de mão e o WASM do MediaPipe vão dentro do APK).
