# Strike Bowl — pacote de código-fonte para auditoria

## Escopo

Este diretório contém a integração integral da fonte e dos assets disponibilizados para o jogo **Strike Bowl**: um desafio de boliche 3D de cinco frames, com física de pinos, placar, inglês (`en`) e chinês simplificado (`zh-CN`).

A fonte foi integrada sobre o runtime **Three.js + Rapier + Vite** já inicializado, sem substituir a engine com outra tecnologia e sem gerar ou trocar assets de gameplay.

## Proveniência e integridade

| Item | Valor |
| --- | --- |
| Arquivo de origem | `f0c44afdbda43672cc00a85e16fc1bd3ff55e8cd3dfdb5bde0f2285d491f5889.zip` |
| URL de origem | `https://d1oupeiobkpcny.cloudfront.net/assets/dashboard/materials/2026/09/27/f0c44afdbda43672cc00a85e16fc1bd3ff55e8cd3dfdb5bde0f2285d491f5889.zip` |
| SHA-256 do arquivo baixado | `f0c44afdbda43672cc00a85e16fc1bd3ff55e8cd3dfdb5bde0f2285d491f5889` |
| Tamanho do arquivo baixado | 2.065.889 bytes |
| Verificação executada | `unzip -tq` — sem erros de dados compactados |
| Arquivo de hashes do pacote final | `AUDIT_FILE_MANIFEST_SHA256.txt` |

## Conteúdo preservado

| Área | Caminho | Observação |
| --- | --- | --- |
| Cliente do jogo | `src/` | Three.js, Rapier, simulação, pista, arremesso, pinos, UI e efeitos. |
| Regras e placar | `server/bowling.mjs`, `server/validate.mjs`, `tests/bowling.test.ts` | Regras de cinco frames, validação e testes. |
| Internacionalização | `src/i18n/en.json`, `src/i18n/zh-CN.json` | Conteúdo em inglês e chinês simplificado. |
| Leaderboard | `src/net/leaderboard.ts`, `server/`, `server/migrations/` | Cliente, API, contrato, migrações e bloqueios de validação do placar fornecidos na fonte. |
| Configuração de build | `package.json`, `pnpm-lock.yaml`, `vite.config.ts` | Build Vite e dependências bloqueadas. |
| Fontes e licenças | `public/fonts/` | Arquivos de fonte e licenças OFL fornecidos. |

## Execução local

### Cliente

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
pnpm smoke
```

O cliente usa `PORT=3000` e `HOST=0.0.0.0` no runtime gerenciado. Para desenvolvimento local com a API do leaderboard, `LB_PROXY=http://127.0.0.1:8080` pode ser informado ao Vite.

### API de leaderboard (opcional)

O código da API está preservado em `server/` com seu próprio `package-lock.json`, migrações SQL e `Dockerfile`. Ela requer um `DATABASE_URL` válido; nenhum segredo, banco de dados, dump, token de usuário ou configuração de produção acompanha este pacote.

```bash
cd server
npm ci
DATABASE_URL='mysql://…' npm run db:migrate
DATABASE_URL='mysql://…' npm start
```

## Estado da integração online

O código original do leaderboard permanece completo para revisão. Nesta integração, porém, **nenhuma infraestrutura online foi habilitada, configurada ou publicada**: a decisão canônica do projeto não aprovou novas integrações online. O cliente preservado trata falhas de rede como jogo offline e não bloqueia a partida quando a API não estiver disponível.

## Alterações de embalagem

Além de copiar a fonte fornecida, este pacote substitui o README genérico do starter por uma descrição do Strike Bowl e adiciona este arquivo de proveniência. Também inclui `pnpm-workspace.yaml` com `onlyBuiltDependencies: [esbuild]`, uma política explícita e revisável necessária para permitir o binário de build usado pelo Vite. Os arquivos de gameplay, backend, migrações, testes, idiomas, fontes, manifestos e configuração da fonte fornecida foram preservados.

## Limites da auditoria

A entrega é um pacote de código e assets. A verificação realizada nesta sessão valida a integridade do ZIP, a estrutura de arquivos e as rotinas de build/teste do repositório; ela **não** constitui auditoria de segurança, certificação, publicação da API, criação de banco de dados ou revisão independente de vulnerabilidades.
