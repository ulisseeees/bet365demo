# ArenaOdds

Sportsbook local construído com Next.js, TypeScript, Zustand e Framer Motion. O projeto possui autenticação, cadastro, carteira, apostas, históricos, painel administrativo e feed combinado da API-Football, The Odds API V4 e Odds-API.io v3.

> Ambiente sandbox local: depósitos, saques e apostas não processam dinheiro real.

## Executar

```powershell
npm.cmd install
Copy-Item .env.example .env.local
npm.cmd run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Banco de dados Neon/Vercel

O Postgres é a fonte de verdade da plataforma. Usuários, carteiras, depósitos, saques, apostas, seleções, cash out, cashback, Free Bets, níveis, promoções, jogos importados e caches das APIs são persistidos no banco — o navegador não é mais responsável pelo histórico financeiro.

No projeto da Vercel, mantenha as variáveis criadas pela integração Neon (`POSTGRES_URL`, `DATABASE_URL` e equivalentes) em **Production**, **Preview** e **Development**. Depois do primeiro deploy:

1. entre como administrador;
2. abra **Admin → Central do banco**;
3. confirme o indicador **Conectado**;
4. use **Migrar caches locais** uma vez;
5. use **Exportar backup** sempre que quiser baixar uma cópia JSON sem senhas.

O schema é idempotente e criado/versionado pela aplicação. Operações financeiras usam transações SQL e bloqueio de carteira para evitar saldo duplicado em requisições simultâneas. Dados antigos do armazenamento `arenaodds-accounts-v2` são importados uma única vez no login e marcados em `legacy_imports`.

## Configurar jogos e odds reais

1. Crie uma conta no [dashboard da API-Sports](https://dashboard.api-football.com/).
2. Ative um plano da API-Football v3 que inclua os endpoints e competições desejados.
3. Copie a chave exibida no dashboard.
4. Abra `.env.local` na raiz do projeto.
5. Preencha apenas no servidor:

```env
API_FOOTBALL_KEY=sua_chave_aqui
AUTH_SECRET=uma-frase-longa-aleatoria-com-mais-de-32-caracteres
ADMIN_EMAIL=seu-admin@exemplo.com
ADMIN_PASSWORD="uma-senha-forte-com-#-entre-aspas"
```

6. Reinicie `npm.cmd run dev` após alterar o arquivo.
7. Acesse `http://localhost:3000/api/live`. Quando estiver funcionando, o JSON terá `"mode":"api"` e partidas em `matches`.

Nunca use `NEXT_PUBLIC_API_FOOTBALL_KEY`: isso exporia a chave no navegador. A integração deste projeto usa a chave somente na rota de servidor `app/api/live/route.ts`.

## Widgets oficiais API-Sports v3.1

A aba **Placar ao vivo** usa o Web Component oficial documentado no PDF `API-Sports - Documentation Widgets.pdf`:

```html
<script type="module" src="https://widgets.api-sports.io/3.1.0/widgets.js"></script>
```

O projeto configura um único widget global e um widget de jogos com atualização a cada 60 segundos, toolbar, layout compacto e abertura dos detalhes/classificação em modal. O fuso é `America/Sao_Paulo` e os rótulos principais recebem tradução em `public/widgets-pt-BR.json`.

Por segurança, a chave real **não** é usada em `data-key`. O componente aponta `data-url-football` para o proxy autenticado:

```text
/api/widgets/football/
```

Esse proxy:

- exige uma sessão autenticada do ArenaOdds;
- aceita somente endpoints conhecidos usados pelos widgets;
- troca o token público do componente pela `API_FOOTBALL_KEY` no servidor;
- mantém cada resposta em cache por 60 segundos;
- rejeita chamadas vindas de contexto cross-site.

O valor `NEXT_PUBLIC_WIDGET_PROXY_TOKEN` é propositalmente público e não dá acesso direto à API-Sports. A chave secreta continua sendo apenas `API_FOOTBALL_KEY`.

Os Widgets v3.1 exibem jogos, placares, eventos, escalações, estatísticas e tabelas. As odds do sportsbook continuam sendo obtidas separadamente pelos endpoints `/odds/live` e `/odds` na rota `/api/live`.

## Endpoints utilizados

- `GET /fixtures?date=...`: jogos reais do dia.
- `GET /odds/live`: odds de partidas em andamento.
- `GET /odds?date=...`: odds pré-jogo do dia.
- `GET /status`: consumo e limites da assinatura.
- `GET /leagues`: temporadas e cobertura disponível por competição.

O navegador verifica o feed local a cada 60 segundos, mas isso não repete chamadas externas. A resposta da API-Football fica em `provider_cache` no Postgres, com os arquivos em `data/` apenas como recuperação local. Nem toda competição ou plano oferece odds ao vivo; consulte `coverage.odds` no retorno de `/leagues` e os limites do seu plano.

### Mercados e limite da assinatura

O feed transforma todos os mercados devolvidos pelo bookmaker com maior cobertura para cada partida. Isso inclui, quando disponível: resultado, total de gols, ambas marcam, escanteios, dupla chance, handicaps, mercados por tempo e placares exatos. Nenhuma odd é inventada quando a API não oferece determinado mercado.

O plano Free possui apenas 100 consultas por dia. Por isso, o padrão seguro deste projeto é:

```env
API_FEED_CACHE_SECONDS=86400
API_FOOTBALL_ADMIN_CACHE_SECONDS=86400
API_ODDS_PAGES=1
```

O feed automático custa normalmente até 3 chamadas por atualização diária: partidas, odds pré-jogo e odds ao vivo. `API_ODDS_PAGES` controla quantas páginas de jogos com odds serão carregadas; cada página adicional consome uma chamada. Se uma atualização falhar, o último feed salvo continua disponível.

### Gerenciar API-Football pelo admin

O painel Admin também possui um fluxo econômico sob demanda:

1. escolha uma data e busque as partidas — no máximo 1 chamada;
2. repetir a mesma data durante o cache custa 0 chamadas;
3. selecione o jogo e consulte suas odds — normalmente 1 chamada;
4. escolha todos os mercados ou apenas os desejados;
5. publique no feed — 0 chamadas adicionais, pois as odds consultadas já estão no cache;
6. use **Atualizar feed** somente quando quiser renovar o catálogo automático — até 3 chamadas.

As buscas e odds administrativas também ficam em `provider_cache`. O painel mostra o saldo diário informado pelos cabeçalhos da API-Football.

## Segunda fonte: The Odds API V4

A segunda API amplia o catálogo com Copa do Mundo, Libertadores, Sul-Americana e Série B. O feed deduplica confrontos equivalentes e combina os mercados quando o mesmo jogo aparece nas duas fontes.

```env
THE_ODDS_API_KEY=sua_chave_aqui
THE_ODDS_API_CACHE_SECONDS=86400
THE_ODDS_API_REGIONS=eu
THE_ODDS_API_MARKETS=h2h,spreads,totals
THE_ODDS_API_SPORTS=soccer_fifa_world_cup,soccer_conmebol_copa_libertadores,soccer_conmebol_copa_sudamericana,soccer_brazil_serie_b
```

Com uma região e três mercados, cada competição custa até 3 créditos por atualização. As quatro competições automáticas custam até 12 créditos por dia, ou aproximadamente 360 em 30 dias. O cache também fica no Postgres, evitando nova cobrança em deploys ou cold starts da Vercel.

### Importar um jogo pelo admin

No painel Admin, a seção **Importar jogo sob demanda** permite:

1. escolher um esporte ou competição;
2. pesquisar e selecionar o confronto — consulta gratuita;
3. descobrir os mercados disponíveis — 1 crédito;
4. selecionar mercados populares ou todos os mercados;
5. ver o custo máximo estimado antes de importar;
6. publicar o jogo imediatamente no feed principal.

O custo de importação é `mercados retornados × regiões`. Eventos importados ficam em `data/imported-odds.json` e são preservados entre reinicializações.

## Terceira fonte: Odds-API.io v3

A terceira integração usa HTTP no plano Free e consulta odds em lotes de até 10 eventos. Configure no máximo dois bookmakers que já estejam selecionados na sua conta da Odds-API.io:

```env
ODDS_API_IO_KEY=sua_chave_aqui
ODDS_API_IO_BOOKMAKERS=BookmakerUm,BookmakerDois
ODDS_API_IO_SPORTS=football,basketball,tennis
ODDS_API_IO_CACHE_SECONDS=600
ODDS_API_IO_MAX_EVENTS_PER_SPORT=20
```

O padrão de 20 eventos em três esportes custa no máximo 9 requisições por atualização: uma busca de eventos e até duas chamadas `/odds/multi` por esporte. O cache de 10 minutos limita o consumo teórico a 54 requisições por hora, bem abaixo do limite documentado de 5.000 requisições por hora. Todas as visitas ao site durante o cache consultam apenas o Postgres e não repetem chamadas externas.

No plano Free não é usado WebSocket. O painel Admin mostra a cota horária, a última atualização, o número de jogos importados e o custo máximo antes de permitir uma atualização manual.

## Acompanhamento ao vivo: Highlightly

A Highlightly é usada somente para partidas de futebol presentes em apostas pendentes. Ela não adiciona jogos nem odds ao feed; o vínculo é feito por times, data e horário com os eventos já recebidos das APIs de odds.

```env
HIGHLIGHTLY_API_KEY=sua_chave_aqui
HIGHLIGHTLY_LIVE_CACHE_SECONDS=60
HIGHLIGHTLY_RESOLVE_CACHE_SECONDS=21600
```

- Uma aposta cria automaticamente o registro de rastreamento.
- O ID da Highlightly é resolvido somente quando o jogo está a menos de 24 horas do início.
- `GET /matches/{id}` entrega placar, relógio, eventos, estatísticas e destaques em uma chamada.
- A interface consulta o banco a cada 15 segundos; a Highlightly atualiza a evidência decisiva em intervalos adaptativos a partir de 60 segundos.
- Sem usuário assistindo, o cron mantém a liquidação em segundo plano a cada minuto.
- API-Football e Odds-API.io confirmam placares a cada 3 minutos; The Odds API usa 5 minutos para proteger a cota mensal.
- Uma trava compartilhada impede navegador e cron de repetirem a mesma consulta externa simultaneamente.
- Partidas sem apostas pendentes não geram chamadas.
- O plano gratuito não fornece coordenadas da bola. O mapa exibido é um mapa de pressão baseado em posse e finalizações reais.

## Deploy automático na Vercel

Quando o projeto Vercel está conectado ao repositório GitHub e à branch `main`, cada push gera um novo deploy automaticamente:

```powershell
git add .
git commit -m "descrição da alteração"
git push origin main
```

As chaves devem ser cadastradas em **Vercel → Project → Settings → Environment Variables** para Production, Preview e Development. Depois de adicionar ou alterar uma chave, faça um novo deploy. Para forçar um deploy direto da pasta atual:

```powershell
npx vercel --prod --force
```

## Acesso administrativo local

Sem alterar `.env.local`, as credenciais iniciais são:

- E-mail: `admin@arenaodds.local`
- Senha: `ArenaAdmin#2026`

Troque ambas antes de compartilhar o projeto. Usuários cadastrados pela tela recebem a função `user`; somente a conta administrativa vê o painel Admin.

Cada usuário possui carteira, apostas e histórico isolados no Postgres. Contas novas começam com saldo principal zerado e recebem R$ 10 de Free Bet promocional. O Arena Club possui níveis Bronze, Prata, Ouro, Platina e Diamante, cashback progressivo e boosts configuráveis de múltiplas.

## Resultados, cash out e contingência

- O acompanhamento é ativado por jogo; partidas não monitoradas não consomem consultas.
- O cron `/api/cron/results` roda a cada 5 minutos e exige `CRON_SECRET`.
- API-Football agrupa até 20 IDs em uma consulta; The Odds API agrupa por competição.
- Resultado, dupla chance, ambas marcam, total de gols, empate-anula e placar exato possuem liquidação automática.
- Mercados de escanteios e jogador são avaliados automaticamente quando a Highlightly fornece os eventos/estatísticas necessários; mercados sem dados suficientes continuam disponíveis para revisão no Admin.
- O cash out combina as odds atuais com placar, minuto, gols, eventos e estado ao vivo, trava a aposta no Postgres e credita o saldo atomicamente.
- Seleções compatíveis do mesmo jogo podem ser combinadas; duplicidades e combinações impossíveis continuam bloqueadas.

## O que informar para personalizar o feed

Não envie sua chave da API. Informe somente:

- ligas e países desejados;
- esportes e mercados necessários;
- frequência de atualização esperada;
- fuso horário;
- plano contratado, sem mostrar a chave;
- mensagem retornada por `/api/live`, se houver erro.

Documentação oficial: [API-Football v3](https://www.api-football.com/documentation-v3).
