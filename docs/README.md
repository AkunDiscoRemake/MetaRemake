# Documentação do MetaPort

| documento | onde vive | para quem |
|---|---|---|
| **SDK / API dos apps** | [`public/web/API.md`](../public/web/API.md) — renderizado em `web/docs.html`, e dentro do app em *Docs → API* e no *Studio* | quem escreve apps para a loja |
| **Manual do usuário** | app **Docs** (launcher → Docs): começo, VR Box, mãos, gestos, apps, API, privacidade | quem acabou de instalar |
| **Casca Android** | [`android/README.md`](../android/README.md) | quem compila o APK à mão |
| **CI do APK** | [`.github/workflows/build-apk.yml`](../.github/workflows/build-apk.yml) + [`RELEASE_NOTES.md`](../RELEASE_NOTES.md) | release automatizada |

## Notas de implementação que evitam dor de cabeça

- **Um só `getUserMedia`.** `engine/camera.js` é o dono do stream; passthrough e
  MediaPipe leem do mesmo `<video>`. Um segundo stream derruba o WebView em aparelhos
  médios e dessincroniza o contorno da mão.
- **`base: './'` no vite e nada de caminho absoluto** em `index.html`: o bundle é
  servido por `WebViewAssetLoader` a partir de `assets/www`, e `"/src/…"` não existe lá.
- **Sem COEP.** Precisamos carregar o WASM do MediaPipe de CDN quando o asset local
  não está no build; `require-corp` quebraria isso.
- **Cadeia de pixels do SBS**: o viewport de cada olho é em **px de CSS** (o three
  multiplica por `devicePixelRatio` sozinho) — errar aqui dá uma imagem dobrada/espelhada.
- **`bendGeometry()` é idempotente** (guarda `geo.userData.base`) porque `curve` pode
  mudar várias vezes com a malha já montada.
- **Regiões do painel** ficam em px absolutos do painel; o que é *chrome* recebe
  `kit.chromeOffset`. Se você desenhar um botão dentro de conteúdo rolável, não
  some com o hit-test: ele acompanha o `panel.scroll` sozinho.
- **`noCompress 'wasm','task'`** no `app/build.gradle`: `.task` gzipado dentro do
  APK faz o MediaPipe falhar de forma silenciosa (o Fetch/`arrayBuffer` fica corrompido).
- **Teste antes do navegador**: `node scripts/smoke.mjs` cobre draw+clique de todos os
  apps e o pipeline das mãos sem WebGL. É o primeiro filtro para qualquer mudança em UI.
