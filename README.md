# Strike Bowl • Boliche Neon — 1.2.1

Jogo web 3D completo de cinco rodadas, construído com Three.js, Rapier e Vite.
A interface neon, física, trilha/efeitos sintetizados, câmera de acompanhamento e cartões de compartilhamento foram preservados e aprimorados sobre a base original.

## Jogar a versão pronta

A pasta `dist/` contém a versão compilada de produção. Não precisa instalar as dependências para jogar essa pasta.

- Windows com Node.js instalado: abra `JOGAR_WINDOWS.bat`.
- macOS/Linux: execute `sh JOGAR_MAC_LINUX.sh`.
- Alternativa em qualquer sistema com Node: `node scripts/serve-built.mjs --open`.
- Endereço local: `http://127.0.0.1:8080/`. Ctrl+C encerra o servidor.

Recomendado: Node.js 24. A abertura direta de `dist/index.html` pelo protocolo file:// não é suportada.
O servidor local recebe conexões somente do próprio computador. Para jogar no iPhone, publique `dist/` em HTTPS. A configuração de build para Vercel está incluída; nenhuma publicação foi realizada neste pacote.

## O que está incluído

- Cinco rodadas com strikes, spares e bônus finais; partida perfeita = 150.
- Teclado, mouse, toque e gamepad; força e efeito; cancelamento seguro de gestos.
- Pista diária com dificuldade progressiva, guia de mira e condições determinísticas.
- Português brasileiro, inglês e chinês simplificado: 141 textos por idioma.
- Qualidade gráfica leve/equilibrada/máxima, bloom na qualidade máxima e redução de movimento.
- Música e efeitos sonoros com ajuste de volume e opção de silêncio.
- Recordes, ajustes e melhores partidas locais, com tolerância a armazenamento indisponível.
- Compartilhamento de cartão e desafio por link, com apelido opcional.
- App instalável/PWA e abertura offline após o primeiro carregamento e cache completos.
- Build de produção separada da build de teste; hooks de automação ausentes na produção.
- Backend opcional de ranking casual, regras compartilhadas e migrações incluídas.

Os recordes locais pertencem ao navegador/dispositivo; apagar os dados do navegador os remove. Não há sincronização automática entre aparelhos.
O dia da pista usa UTC. Em Fortaleza/Paraíba, a virada UTC acontece às 21h. Novas partidas atualizam o dia; partidas que atravessam a virada continuam localmente, mas o ranking online rejeita uma sessão do dia anterior.

## Campanha contra o computador

No menu, escolha **Campanha • Duelo contra bots** para abrir **A Rota Neon**. Toque em uma fase liberada para disputar cinco rodadas contra seu adversário. Vença para abrir a próxima fase; empate ou derrota exigem revanche. São 12 fases e três chefes. As estrelas e vitórias ficam salvas neste navegador. Você pode repetir fases já vencidas e continuar usando o modo livre.

O bot usa a mesma física, com precisão crescente. Sua partida é calculada antes da sua, sem ajustar o resultado para vencer ou perder de propósito. A súmula dele aparece rodada por rodada; seus lançamentos não têm uma animação 3D própria.

## Controles

| Dispositivo | Posicionar | Mirar | Força | Efeito |
|---|---|---|---|---|
| Teclado/mouse | A/D | Mouse ou ←/→ | Segure clique/Espaço e solte | Arraste ou ←/→ durante carga |
| Toque | Botões ◀/▶ | Pressione a pista | Segure na pista/botão e solte | Deslize lateralmente |
| Gamepad | Analógico esquerdo | Analógico direito | Segure A e solte | Analógicos durante carga |

Escape/P pausa, R reinicia durante a partida. Menus também funcionam por teclado e gamepad.
Um cancelamento de toque, perda de captura, desfoque ou desconexão do controle cancela a carga em vez de lançar a bola.

## Desenvolvimento e validação reproduzível

```sh
npx --yes pnpm@10.18.0 install --frozen-lockfile
npm test
npm run build
npm run dev
```

Para testes de navegador:

```sh
npm run build:test
npx playwright install chromium
npm run smoke
npm run acceptance
npm run campaign:test
npm run offline:test
```

Os testes de navegador aceitam `BROWSER_EXECUTABLE_PATH` quando um Chromium externo é necessário. O teste offline usa `dist/`; smoke/aceitação usam `dist-test/`, que deve ser reconstruída antes da execução.
Em produção, o service worker armazena apenas os arquivos estáticos conhecidos; requisições de API ficam fora do cache. Uma atualização aguarda o encerramento das abas antigas para preservar a partida em andamento.

## Ranking online opcional

O modo padrão funciona sem banco, conta ou API. O histórico local permanece disponível.
Para habilitar o ranking casual, configure a API e compile com `VITE_LEADERBOARD_ENABLED=true`.
O servidor está em `server/`, usa Node 22+ e MySQL; necessita `DATABASE_URL`. O navegador nunca recebe essa credencial.

```sh
cd server
npm ci
npm run db:migrate
npm start
```

A variável `DATABASE_URL` deve estar no ambiente desses comandos. Em desenvolvimento, `LB_PROXY=http://127.0.0.1:8080` encaminha `/api` pelo Vite. Na hospedagem, configure o encaminhamento de `/api` para a API separada; a publicação do cliente estático sozinha não instala o backend.
Nenhuma credencial, banco ou infraestrutura online acompanha esta entrega.

O servidor recalcula a pontuação e verifica duração e sessão. O ranking é casual: ele recebe os lançamentos do cliente e não comprova a execução física da partida. Não há anticheat competitivo autoritativo.

## Organização e evidências

- `src/`: cliente completo, gráficos, física, UI, áudio, idiomas e rede.
- `public/`: fontes, licenças, ícones e manifesto.
- `dist/`: cliente compilado, pronto para servir/publicar.
- `server/`: API, contratos e migrações opcionais.
- `tests/` e `scripts/`: regressões, build, navegador e servidor local.
- `shots/`: capturas e resultados da aceitação.
- `RELEASE.md`: validações, correções e limites desta versão.
- `docs/BASELINE_AUDIT.md`: documentação histórica do pacote original.
- `INTEGRITY_SHA256.txt`: integridade dos arquivos desta entrega.

## Licenças

Fontes Figtree, Sora e Noto Sans SC: SIL OFL, com avisos preservados em `public/fonts/`.
As bibliotecas permanecem sob suas licenças próprias. O pacote não inclui o navegador de testes ou node_modules.

### Atualização 1.2.1 — correções de acessibilidade e validação

Os controles de pausa, movimento e lançamento agora expõem rótulos traduzidos
em português, inglês e chinês para leitores de tela. O teste de layout aceita
`BROWSER_EXECUTABLE_PATH`, como os demais testes de navegador, e o `.gitignore`
não inclui mais a build temporária `dist-test/`.

### Atualização 1.2.0 — interface e placares

A tela inicial traz “Criado por Sergio Ribeiro Jr. 2026” acima do título.
O HUD organiza status, súmulas e estatísticas em regiões separadas, com os dois
placares em colunas no desktop e empilhados no celular. O computador usa a mesma
súmula do jogador: acertos por lançamento, strikes, spares, cumulativos e bônus
na quinta rodada; as jogadas futuras ficam ocultas. O seletor de idiomas abre
os ajustes e identifica explicitamente Português (Brasil), English e 中文.

Validação: 56 testes unitários, 15 verificações de campanha, 14 de controles e
7 verificações de layout/placar aprovadas. Layout conferido em 375×667,
430×744, 430×932, 844×390, 932×430 e 1440×900 no Chromium com emulação móvel.
Não substitui validação em aparelhos físicos. Executar `node scripts/layout-check.mjs`
após `npm run build:test` (requer Chromium no caminho configurado no script).
