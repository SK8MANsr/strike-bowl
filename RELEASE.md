# Strike Bowl 1.3.0 — entrega final

## Atualização 1.3.0 — arsenal e campanha premium

- Adicionado sistema persistente de recompensas: cinco bolas coloridas, desbloqueadas por estrelas da campanha, com bônus de mira, força, efeito e combinação híbrida.
- Adicionado seletor lateral no HUD, responsivo e acessível, permitindo trocar a bola antes de cada jogada.
- Redesenhado o mapa de fases com rota estratégica, cartões glass, progresso visual, estados de bloqueio e foco no próximo objetivo.
- Refinado o áudio Web Audio para simular pista, madeira e pinos com camadas de impacto, rolamento e clatter escalonado.
- Mantida compatibilidade com saves anteriores: jogadores antigos iniciam com a bola Classic e desbloqueiam as demais normalmente.

### Evidência adicional

| Verificação | Resultado |
|---|---|
| Vitest completo | 60 testes aprovados em 9 arquivos |
| Build de produção e PWA offline | Aprovados |
| Smoke e aceitação móvel/teclado/gamepad | Aprovados |
| Campanha oficial | CAMPAIGN PASS |
| Check offline oficial | offline: OK |


Data de validação: 30/09/2026.

Esta entrega consolida a base modular Three.js/Rapier/Vite e os recursos úteis dos protótipos neon: cinco rodadas, efeito, força, câmera, câmera lenta, feedback de strikes/spares, dificuldade e suporte a vários dispositivos. Uma única simulação evita duplicar motores físicos e estados de jogo.

## Correções verificadas

- Eventos físicos preservados entre subpassos, estabilização dos pinos com tolerâncias adequadas a corpos pequenos e rack congelado após a contagem.
- Canaleta não derruba pinos por ricochete e preserva o rack para a próxima bola.
- Zero seguido de dez pinos é spare; bônus finais seguem as regras de cinco rodadas, com máximo 150.
- Gestos cancelados, perda de foco/captura e controle desconectado cancelam a carga sem lançar.
- Reinício e troca de tela cancelam mensagens, resultados e animações pendentes; pausa não produz lançamento involuntário.
- Português completo, histórico local, renovação de sessão online, confirmação de apelido e posições indisponíveis sem números fictícios.
- Ranking online explicitamente casual; o cliente funciona sem API. Produção sem hooks de teste.
- PWA com arquivos locais, cache versionado, APIs fora do cache e atualização sem interromper abas abertas.

## Evidência de validação

| Verificação | Resultado |
|---|---|
| Vitest: regras, física, entrada, persistência, idiomas, ranking e servidor estático | 44 testes aprovados em 7 arquivos |
| TypeScript e build de produção | Aprovados |
| Rack sem impacto por 10 segundos; bola lenta antes do deck | Todos os pinos permanecem em pé |
| Partida de cinco rodadas com física real e racks parciais | Concluída; súmula válida e rack estável após contagem |
| Smoke no navegador após a correção final | Lançamentos 8,0,5,2,8,0,5,2,3,0; total 33 conferido |
| Aceitação móvel/teclado/gamepad simulado | 14 verificações; evidência em `shots/acceptance.json` |
| Produção offline | Abre e inicia partida sem rede após cache inicial; hooks ausentes |
| Transferência do cliente, estimada por gzip | 3,63 MB incluindo fontes |

Os testes de navegador usam Chromium 153 com renderização SwiftShader. O smoke inclui um gesto real de mouse, demais arremessos automatizados através da build de teste, conferência da pontuação final, reinício e idiomas. Os testes móveis usam eventos reais de toque via Chromium/CDP em 430×932, 932×430 e 375×667. Capturas estão em `shots/`.

## Limites práticos

Safari em iPhone físico e gamepad físico não foram testados nesta sessão. O backend opcional não foi conectado a um MySQL real nem publicado. As regras e o fluxo de rede foram testados localmente; instalação, credenciais e hospedagem devem ser configuradas no ambiente de destino.

O ranking casual não equivale a anticheat autoritativo. O pacote entrega cliente completo, fonte, build, testes e API opcional; não representa certificação empresarial, auditoria de segurança independente ou garantia de desempenho em todos os dispositivos.

Os arquivos originais foram preservados. As alterações estão isoladas nesta versão. Veja `README.md` para execução, publicação e reprodução das verificações. Licenças das bibliotecas distribuídas estão em `docs/licenses/`; licenças das fontes em `public/fonts/`.

## Atualização 1.1.0 — campanha A Rota Neon

- 12 fases sequenciais, 12 bots e chefes nas fases 4, 8 e 12. O mapa serpenteia entre os adversários, mostra fases vencidas, bloqueadas e a próxima disputa.
- Cada duelo tem cinco rodadas e bônus reais de boliche. O jogador avança somente com pontuação estritamente maior; empate e derrota permitem revanche.
- O bot simula seus próprios lançamentos no Rapier antes da partida do jogador, com precisão crescente. A súmula permanece oculta e é revelada conforme as rodadas do jogador são concluídas. Não há animação 3D dos lançamentos do bot; a disputa mostra sua súmula por rodada.
- Uma vitória concede de uma a três estrelas conforme a diferença de pontos (1: vitória; 2: diferença ≥10; 3: diferença ≥25). Repetir uma fase nunca reduz estrelas ou melhor pontuação.
- Progresso e tentativas em um registro local separado, sem apagar recordes e ajustes anteriores. Não há sincronização de campanha entre aparelhos.
- 54 testes aprovados em oito arquivos, incluindo dez novos testes de campanha, partidas físicas determinísticas dos bots e calibração entre iniciante e chefe final.
- Aceitação de campanha no navegador usa placares completos controlados para verificar vitória/derrota/empate; a geração física do adversário é verificada separadamente. Evidência em `shots/campaign-acceptance.json` e capturas do mapa/duelo/vitória.

A versão compilada 1.1.0 mantém a distribuição modular e a abertura offline. O servidor de ranking permanece opcional; as partidas da campanha ficam no dispositivo.

Publicação da campanha: https://strike-bowl-neon.vercel.app — deploy de produção `dpl_7ovqr3u8fTinkACfHSEwnwZ1SeSk`, estado READY. A versão anterior permanece disponível no histórico do projeto para rollback. A atualização também preserva o recorde diário do modo livre.

Verificação em produção aprovada: página pública sem login, mapa com 12 fases, duelo contra bot, lançamento e contagem; recarga e preparação de duelo sem rede após cache inicial. Nenhum erro de console. Evidência em `shots/campaign-production.json`.
