# VAR — Verified Action Reports

Feed de notícias de desporto em tempo real, feito só com serviços gratuitos.

## De onde vêm as notícias

- **Sites com RSS e agências** (mais de cem fontes no `fontes.json`: imprensa portuguesa — Record, A Bola, O Jogo, Maisfutebol, zerozero, Bola na Rede, Público, JN, DN, Tribuna Expresso, SIC Notícias, CNN Portugal, RTP, TSF, Renascença, SAPO, Observador, Notícias ao Minuto, Canal 11, Sport TV, GoalPoint —, agências de notícias — Lusa, Reuters, Associated Press, AFP, EFE, ANSA, SID —, imprensa estrangeira — BBC, Guardian, Sky Sports, Telegraph, Independent, Mirror, Mail, talkSPORT, The Athletic, Marca, AS, Mundo Deportivo, SPORT, Relevo, Gazzetta, Corriere dello Sport, Tuttosport, Sky Italia, Calciomercato, Di Marzio, kicker, BILD, Sky Deutschland, SPORT1, Sportschau, Transfermarkt, L'Équipe, Foot Mercato, RMC, Le Parisien, ESPN, B/R Football, ge, Olé, Al Jazeera, Arab News —, sites oficiais (FIFA, UEFA, Liga Portugal, FPF, Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, clubes) e jornalistas de referência, seguidos pelo Google News pelo nome). O servidor verifica ao segundo os feeds das fontes marcadas com `"rapido": true`, a cada 15 segundos os restantes e a cada minuto as que são lidas pelo Google News. Se um site pedir calma (resposta 429), abranda sozinho e volta ao ritmo normal quando o site deixar de se queixar.
- **Canais do Telegram** (Fabrizio Romano, B24). As mensagens chegam em um ou dois segundos. Quando o canal republica um post do X, o botão do site abre esse post no X.
- **Contas do Bluesky** (David Ornstein, Fabrizio Romano), pelo stream público do Bluesky, também em segundos.
- **Zapping do zerozero** (`https://www.zerozero.pt/rss/zapping`), lido a cada minuto: diz que canal português transmite cada jogo. O canal aparece ao lado do resultado, com o logótipo, na página inicial, no quadro de resultados e nos cartões com marcador. Os canais estão no `canais.json`: `re` reconhece o nome como vem no feed, `dominio` vai buscar o logótipo e `cor` é a cor de recurso quando o logótipo não carrega. Para usar uma imagem própria, junta `"logo": "https://…"` ao canal. As transmissões de andebol, futsal, femininos e escalões só entram nos cartões da mesma modalidade. O emparelhamento entre o nome que a ESPN usa e o que o zerozero usa é tolerante (Sheffield Utd e Sheffield United, Athletic Club e Athletic Bilbao, Man United e Manchester United, Vitória SC e Vitória de Guimarães, Köln e Cologne), mas exige as duas equipas, o que evita enganos como confundir o Sporting com o Sp. Braga. Os jogos para os quais não se encontrou transmissão ficam listados em `/api/zapping/estado`, no campo `semCanal` — é por aí que se vê que nome está a falhar e se acrescenta ao `NOMES` ou ao `PALAVRAS` do `server/sources/zapping.js`. A grelha é guardada em `data/zapping.json`, para um reinício a meio da tarde não perder as transmissões dos jogos que já saíram do feed.
- **Resultados em direto** (GOAL API): início, golos, intervalo e final dos jogos das ligas do `ligas.json`, publicados como notícias. No site, a secção Resultados tem um botão para cada visitante escolher as ligas que quer ver.

A tradução para as seis línguas é feita pelo Google Tradutor público (gratuito, sem chave e sem quota); o Gemini só é usado se o Google falhar. As notícias que o Gemini não chegou a tratar, por ter esgotado o limite gratuito, também têm o título traduzido para português e inglês. O estado está em `/api/tradutor/estado`. As notícias de lotarias (Euromilhões, Totoloto…) são ignoradas.

Cada notícia (exceto os resultados) passa pelo Gemini, que decide se é notícia, escolhe as secções, escreve título e pontos em português e inglês, dá a nota de importância e junta as notícias repetidas de várias fontes.

## O que é preciso (tudo gratuito)

- Node.js 20 ou mais recente.
- Uma chave do Gemini, criada em aistudio.google.com, sem cartão.
- Uma conta Telegram, e as credenciais `api_id` e `api_hash`, criadas em my.telegram.org › API development tools.
- Uma chave da GOAL API, com o plano gratuito de goal-api.com.

## Arrancar

```
cp .env.example .env        # preenche as chaves
npm install
npm run telegram-login      # uma vez: liga a tua conta Telegram e mostra a TG_SESSION para o .env
npm run verificar-fontes    # confirma cada fonte e mostra o atraso real
npm run dev
```

Abre http://localhost:5173.

A conta Telegram usada fica inscrita nos canais do `fontes.json`, porque o Telegram só envia mensagens novas de canais onde a conta está. Não partilhes a `TG_SESSION`: dá acesso à conta.

## Saber se as fontes estão a funcionar

Duas maneiras, e as duas dizem o mesmo:

- **No site**, nas definições, cada fonte tem uma etiqueta: `RSS`, `TELEGRAM`, `BLUESKY` (verde, feed próprio, atraso de segundos), `GOOGLE NEWS` (amarelo, atraso de minutos) ou `✗` (vermelho, não responde, com o erro no tooltip). O tooltip mostra também o endereço em uso e há quanto tempo essa fonte trouxe a última notícia. No topo do painel há o resumo («X com feed próprio · Y pelo Google News · Z sem responder») e um botão para ver só as fontes com problemas. Os dados vêm do `/api/fontes` e são refrescados de minuto a minuto.
- **Na linha de comandos**, `npm run verificar-fontes` testa cada fonte em todos os endereços indicados (`feed` e `feeds`), depois procura o feed na própria página do site, e para cada um diz quantas notícias trouxe, a idade da mais recente e o tempo de resposta. Um feed sem itens, ou parado há mais de uma semana, conta como falhado. No fim resume quantas fontes têm feed próprio e quais é que ficam dependentes do Google News.

Duas coisas que o teste revelou e que o servidor já trata sozinho: há sites que recusam pedidos de programas e respondem 403 (A Bola, Observador, Canal 11, Notícias ao Minuto, SIC, AP, Olé…), e por isso o pedido do feed é repetido uma vez como um browser normal — desliga-se com `RSS_UA_ALTERNATIVO=0` no `.env`; e há feeds que datam as notícias no futuro por terem o fuso mal configurado (RTP, ESPN, Sportschau), pelo que uma notícia datada à frente da hora atual fica com a hora a que chegou, marcada como aproximada.

Estas fontes não têm RSS público e ficam sempre pelo Google News, com o atraso de minutos que isso traz: Lusa, Reuters, AP, EFE, ANSA, The Athletic, Flashscore, Sport TV, Liga Portugal, FPF, Premier League, LaLiga, Lega Serie A, Ligue 1, UEFA, FIFA, MLS, AFC, CAF, CONMEBOL, Goal.com, Relevo, Cadena SER, Gazzetta (feed abandonado), Sky Sport Itália, Sky Sport Alemanha, Evening Standard, Arab News e os jornalistas seguidos pelo nome.

Com `npm run arrumar-fontes` (o mesmo teste com `--corrigir`) o resultado é gravado no `fontes.json`: o endereço que funciona passa a ser o `feed` principal, os que falharam são retirados e as fontes sem feed nenhum ficam só com o `google`. Convém correr isto de vez em quando, porque os jornais mudam os endereços dos feeds sem avisar.

## Configurar fontes

Tudo está em `fontes.json`:

- `rss`: basta o endereço do site; o servidor encontra o feed sozinho. Se o `verificar-fontes` disser que não o encontrou, procura o link do feed no site e põe-no no campo `feed`.
- `telegram`: o nome público do canal (o que aparece em t.me/…).
- `bluesky`: o nome da conta (…bsky.social).
- `col`: a coluna dos Destaques a que a fonte pertence — `pt`, `en`, `es`, `it`, `de`, `fr`, `mundo` ou `portugueses`. Só é usada quando o Gemini não conseguiu identificar o país de que a notícia trata; nesse caso, a notícia fica na coluna da origem da fonte.
- `google`: a pesquisa do Google News a usar quando o site não tem feed ou bloqueia o servidor. Com `"soGoogle": true`, a fonte é lida sempre pelo Google News — é assim que entram as agências sem RSS público e os jornalistas seguidos pelo nome.
- `feeds`: endereços alternativos. O servidor experimenta o `feed`, depois cada um dos `feeds`, depois procura o feed na própria página do site e só no fim passa ao Google News.
- Para acelerar uma fonte, junta-lhe `"rapido": true`; para a abrandar, `"intervalo": 60` (segundos).
- `soDesporto`: para jornais generalistas, só deixa passar o que é desporto. Serve de rede quando o feed de desporto falha e o servidor cai no feed geral do jornal.
- As fontes lidas pelo Google News são as mais lentas do site: o Google indexa as notícias com alguns minutos de atraso e nada no servidor encurta isso. O `GOOGLE_NEWS_SEGUNDOS` (30 por omissão) encurta só a última espera. Para uma fonte ficar rápida tem de ter feed próprio — corre `npm run verificar-fontes`, vê quais é que aparecem com «passo a usar o Google News» e procura o RSS no site para pôr no `feed`.

## Quem deu primeiro e quem confirmou

Quando a mesma notícia chega por várias fontes, não aparece várias vezes: fica um só cartão, o da fonte que a deu primeiro, com a hora dela. As outras entram como confirmações, num quadradinho cada uma, com a bandeira, o nome do órgão e «acabou de confirmar» nos primeiros dez minutos (depois passa a mostrar a hora). A fonte original recebe o selo «Deu primeiro», e uma notícia importante que ainda só tenha uma fonte é marcada como «Só nesta fonte». Nas colunas da página inicial isto aparece em miniatura: as bandeiras de quem confirmou e a contagem.

Com três fontes diferentes, a importância da notícia sobe um nível, o que a faz subir nas colunas.

A deteção de repetidos é feita de duas maneiras: por comparação dos títulos (mesmo endereço, título igual, ou quase todas as palavras em comum, numa janela de 18 horas) e pelo Gemini, que recebe a lista das notícias recentes e diz se o post novo é a mesma coisa — é isto que junta a notícia dada em italiano pela Gazzetta à mesma notícia dada em português pelo Record. Quantas notícias recentes o Gemini compara define-se em `REPETIDOS_JANELA` (80 por omissão): mais notícias detetam mais confirmações, mas cada pedido fica maior e o plano gratuito esgota-se mais depressa.

## Vídeos

A primeira coluna da página inicial é um feed automático de vídeos de futebol: golos, resumos, defesas, VAR, expulsões e fintas. As fontes estão no `fontes.json`, na secção `videos`:

- **VSPORTS** (vsports.pt), o site oficial de vídeos da Liga Portugal: cada golo da Liga Portugal Betclic, da Liga 2 e das taças, publicado poucos minutos depois, e os resumos de cada jogo. Lido a cada 20 segundos (`VSPORTS_SEGUNDOS`). É a fonte principal nos jogos portugueses e não depende do Reddit.
- **Reddit** (r/Evangelista_TV e r/soccer), lidos num só pedido. Sem conta, o servidor lê o JSON público a cada 8 segundos e, se o Reddit o recusar, passa para o RSS. Com uma app gratuita do Reddit (`REDDIT_CLIENT_ID` e `REDDIT_CLIENT_SECRET` no `.env`) usa a API oficial e lê a cada 3 segundos.
- **Sport TV** (sporttv.pt/videos), lida a cada 20 segundos (`SPORTTV_SEGUNDOS`): golos e resumos dos jogos que a Sport TV transmite. Os vídeos estão na Kaltura; o servidor procura o ficheiro no manifesto público da Kaltura e, se a Kaltura o recusar, usa o leitor da Kaltura com o `SPORTTV_UICONF` (se não o encontrar sozinho no site). Sem nenhum dos dois, o cartão mostra a miniatura e o vídeo abre no site da Sport TV.
- **Streamain** (streamain.com), lido a cada 30 segundos (`STREAMAIN_SEGUNDOS`): só entram os vídeos com título de desporto, e tocam no site pelo leitor do próprio Streamain.
- **Telegram** (t.me/twclipshdeuropa e t.me/footballlivegoals), lidos pela página pública de cada canal, sem conta, a cada 10 segundos. O Telegram não bloqueia servidores, por isso é a fonte mais fiável em tempo real.

**Tempo real no Reddit.** Desde maio de 2026, o Reddit recusa o JSON público a servidores de alojamento (como o Northflank) e deixa o RSS a cerca de um pedido por minuto, quando o deixa; a API oficial passou a exigir aprovação prévia. Por isso há um retransmissor, que corre num computador de casa, onde o Reddit responde:

```
VAR_URL=https://o-teu-site VIDEOS_RELAY_TOKEN=uma-chave-tua npm run reddit-relay
```

No servidor põe-se a mesma `VIDEOS_RELAY_TOKEN`. O retransmissor lê o JSON a cada 5 segundos (se o Reddit também o recusar em casa, passa ao RSS, a cada minuto) e envia os vídeos para `/api/videos/relay`. Enquanto o retransmissor estiver a enviar, o servidor deixa de pedir ao Reddit. Sem ele, o servidor tenta o JSON e depois o RSS sozinho, com o atraso que o Reddit impuser. Os feeds de notícias do Reddit no `fontes.json` passaram a ser lidos de 4 em 4 minutos, para não gastarem o limite que o feed de vídeos precisa.

Só entram publicações com vídeo. Cada vídeo é classificado pelo título e pela flair (Golo, Highlight, Defesa, Expulsão, VAR, Finta, Outros) e o título é lido para tirar as equipas, o resultado, o jogador e o minuto. A competição vem do jogo em direto com as mesmas equipas.

O mesmo vídeo publicado em várias fontes fica num só cartão. A comparação é feita por esta ordem: endereço do vídeo, publicação original de que a outra é partilha, miniatura (imagem exatamente igual) e lance (mesmas equipas, mesmo resultado e mesmo minuto ou jogador). Nos jogos portugueses a fonte principal é o r/Evangelista_TV; nos restantes, quem publicou primeiro.

Os vídeos do YouTube, Streamable, Reddit e Telegram tocam dentro do cartão; os outros abrem no site de origem. A API está em `/videos/latest` (e `/api/videos/latest`, com `?categoria=` e `?limit=`), e o estado das fontes em `/api/videos/estado`. Os vídeos ficam guardados em `data/videos.json`.

## Capas

O separador Capas, e a faixa «Capas de hoje» na página inicial, mostram as capas dos jornais desportivos do dia, agrupadas por país. As fontes principais são o VerCapas (vercapas.com) e o site irmão espanhol VerPortadas (verportadas.es). Além de A Bola, Record e O Jogo, o servidor lê as categorias de desporto dos dois sites de seis em seis horas e junta todas as publicações que tenham capa na última semana (Marca, AS, Sport, Mundo Deportivo, Superdeporte, L'Esportiu, L'Équipe, Tuttosport, os jornais dos clubes e as revistas). As que estão paradas há mais de uma semana ficam de fora. A lista em uso aparece em `/api/capas/estado`, no campo `jornais`. O SAPO e o Kiosko completam com os jornais que o VerCapas não tem; quando há capa do mesmo jornal em mais de uma fonte, fica a do VerCapas. A página é relida de 20 em 20 minutos (de 5 em 5 entre a meia-noite e as 9h de Lisboa). As imagens passam pelo servidor (`/api/capas/img/<id>`), para aparecerem mesmo que o SAPO recuse imagens pedidas de outros sites. Se a secção ficar vazia, o `/api/capas/estado` mostra o erro e um excerto da página que o SAPO devolveu.

## Página inicial

No topo ficam os jogos a decorrer, com resultado ao minuto, emblemas e o canal que os está a transmitir; quando não há jogos em curso, aparecem as próximas transmissões na televisão portuguesa. Abaixo, os Destaques são oito colunas, por origem da notícia: Portugal, Inglaterra, Espanha, Itália, Alemanha, França, Resto do Mundo e Portugueses pelo mundo. A coluna de cada notícia vem do país de que ela trata (`pais_tema`, dado pelo Gemini); quando esse país não é identificado, vale a coluna da fonte (`col` no `fontes.json`). As notícias de portugueses fora de Portugal vão sempre para a última coluna.

As fontes aparecem nas definições do site agrupadas pelo país de origem (o campo `pais`), com Portugal e as cinco grandes ligas primeiro e um botão para ligar ou desligar o país inteiro.

## Possíveis histórias

A secção junta duas origens, que se filtram no topo:

- **Dos jogos**: sinais nos resultados e nas classificações — surpresas, reviravoltas, goleadas, expulsões, séries de vitórias ou de derrotas, mudanças de líder, entradas na zona de descida.
- **Das notícias**: cada notícia forte (confirmada por duas fontes ou com importância 4 ou 5) é desdobrada em pista de trabalho, com o fio da história (o que vinha antes, o que mudou agora), o que pode acontecer a seguir e as consequências, classificadas como desportivas, contratuais, financeiras, competitivas, institucionais ou disciplinares.

O desdobramento é feito pelo Gemini a partir de material fechado: o texto da notícia, os pontos, as fontes que a confirmaram, os clubes envolvidos e os títulos das notícias relacionadas que já passaram pelo feed nos últimos 14 dias. As instruções proíbem acrescentar números, nomes, datas, valores, cláusulas, declarações ou histórico que não estejam nesse material, e proíbem usar conhecimento próprio do modelo para afirmar factos: o que falta passa para a lista «a verificar». Cada possibilidade é escrita como hipótese e tem de declarar de que depende — no site aparece como «pode acontecer X — se Y». Quando a notícia é vaga (rumor sem nada de concreto, nota de duas linhas, antevisão de rotina), o modelo devolve que não há matéria e fica só a pista simples de tema em destaque.

Para não esgotar o plano gratuito, só uma notícia é desdobrada de cada vez, com 30 segundos entre pedidos e um máximo de 40 por hora (`HISTORIAS_GEMINI_INTERVALO_MS` e `HISTORIAS_POR_HORA`). Passado o limite, ou sem chave do Gemini, as notícias fortes continuam a dar a pista simples.

## Ligas dos resultados

O `ligas.json` define as ligas que o servidor acompanha. Cada liga é reconhecida pelo nome e pelo país. Se uma liga não for reconhecida, corre `npm run ligas -- portugal` para ver o id na GOAL API e junta `"id": "…"` à entrada.

O plano gratuito da GOAL API tem 1.000 pedidos por dia. O servidor lê o calendário do dia e só consulta a API durante os jogos das ligas escolhidas. Nesse tempo, reparte os pedidos que restam: com poucas ligas, verifica a cada 20 segundos; num dia com muitas ligas a jogar desde a manhã até à noite, o intervalo pode subir para 30 a 40 segundos. Quanto menos ligas no `ligas.json`, mais rápido fica.

## Limites a conhecer

- O plano gratuito do Gemini tem limites por minuto e por dia. O servidor junta várias notícias por pedido. Se o limite se esgotar, as notícias saem na mesma, classificadas por palavras-chave e sem tradução, até o limite voltar. No plano gratuito, a Google pode usar o conteúdo enviado para melhorar os modelos.
- Nos feeds RSS, o atraso depende também de o site atualizar o feed. O `verificar-fontes` mostra a idade da notícia mais recente de cada feed.
- Com `npm run verificar-fontes` vês também um exemplo de jogo lido da GOAL API. Se aparecer «formato por reconhecer», o formato da API mudou e é preciso ajustar os nomes dos campos em `server/sources/results.js`.

## Tipo de letra

O site usa a pilha de tipos do sistema (`-apple-system`, `BlinkMacSystemFont`, `SF Pro Display`/`SF Pro Text`), o que quer dizer San Francisco em Mac, iPhone e iPad, Segoe UI em Windows e Roboto em Android. A San Francisco não pode ser servida como tipo de letra web — a licença da Apple só permite usá-la nos sistemas dela —, por isso não há ficheiro nenhum a descarregar: em aparelhos Apple o site aparece com ela; nos outros, com o tipo equivalente do sistema. Como a San Francisco não tem versão condensada acessível por CSS, os títulos ficaram com corpos um pouco menores e espaçamento negativo, para ocuparem a largura de antes.

Ganhou-se também velocidade: já não há pedido nenhum ao Google Fonts no arranque do site.

## Pôr online

```
npm run build
npm start
```

O servidor entrega o site e a API na porta 3001. Tem de estar sempre ligado, por isso serve um computador teu, um Raspberry Pi ou uma máquina virtual gratuita, como a Always Free da Oracle Cloud. Se quiseres o site no Netlify (plano gratuito), o `netlify.toml` já está preparado: cria no Netlify a variável `VITE_API_URL` com o endereço do servidor e põe o endereço do site em `ALLOWED_ORIGIN` no `.env` do servidor.

## Nesta semana

O que aconteceu no desporto nos sete dias da semana atual (de segunda a domingo), há 1, 2, 3, 4, 5, 10, 15… 100 anos: acontecimentos, nascimentos e mortes da Wikipédia (pela API «Neste dia» e, se ela falhar, pela página de cada dia), desportistas e acontecimentos de futebol, futsal, basquetebol e hóquei em patins do Wikidata, e jogos de futebol e de basquetebol da ESPN. A lista é refeita quando a semana muda e revista de meia em meia hora. O estado está em `/api/efemerides/estado`.

**Pesquisa na web de cada dia (gratuita, pelo Gemini).** Com a `GEMINI_API_KEY` que o site já usa, e sem mais nada, o servidor pede ao Gemini, para cada dia da semana, que pesquise no Google os acontecimentos desportivos, portugueses e internacionais, que marcaram esse dia em cada um daqueles anos. A pesquisa Google («grounding») está incluída no plano gratuito, e sete pedidos por semana ficam muito abaixo dos limites diários. Estes acontecimentos aparecem com a etiqueta «pesquisa Gemini». O modelo acerta-se com `EFEMERIDES_GEMINI_MODEL` (por omissão, o `GEMINI_MODEL`).

**Pesquisa do Claude (opcional, paga).** Com `ANTHROPIC_API_KEY` no `.env`, o servidor passa a usar o Claude em vez do Gemini (`EFEMERIDES_MOTOR=gemini` mantém o Gemini mesmo com a chave da Anthropic): faz, para cada dia da semana, um pedido ao Claude (Claude Opus 5.5, com a ferramenta de pesquisa na web da Anthropic): que acontecimentos desportivos, portugueses e internacionais, marcaram esse dia em cada um daqueles anos. O Claude confirma cada facto na web, dá até três por ano (pelo menos um português quando houver), com título, descrição e a fonte, e devolve tudo numa lista estruturada. São sete pedidos por semana, feitos quando a semana muda, hoje primeiro; um dia que falhe é repetido na revisão seguinte. Estes acontecimentos aparecem primeiro em cada ano, com a etiqueta «pesquisa Claude» e a ligação para a fonte. Ficam em `data/efemerides-claude.json`; o estado está em `/api/efemerides/estado`, no campo `claude`.

Ao contrário do resto do site, isto tem custo: cada dia é um pedido ao Claude Opus 5.5 mais as pesquisas na web que ele fizer (no máximo `EFEMERIDES_CLAUDE_PESQUISAS`, 15 por dia), aos preços da Anthropic. O modelo, o esforço (`EFEMERIDES_CLAUDE_ESFORCO`, `medium` por omissão) e o número de pesquisas acertam-se no `.env`. Sem a chave da Anthropic, fica a pesquisa gratuita do Gemini; sem nenhuma das duas, a secção continua a funcionar com a Wikipédia, o Wikidata e a ESPN.

## Ligas e Federações (notícias e comunicados oficiais)

No Feed, por baixo dos Destaques, vem a «Ronda pela atualidade» (as colunas de notícias) e, a seguir, a secção «Ligas e Federações», com as notícias e os comunicados oficiais das ligas e federações: Premier League e FA, LALIGA e RFEF, Ligue 1 e FFF, Bundesliga e DFB, Lega Serie A e FIGC, CBF, FIFA, UEFA, CONMEBOL, FPF, Liga Portugal e as 22 associações distritais. Estão no `oficiais.json`, uma coluna por país (a de Portugal chama-se «Futebol profissional»; as associações têm a sua), com um filtro Todos · Notícias · Comunicados.

Cada fonte é lida a cada 60 segundos (`OFICIAIS_SEGUNDOS`) pela via mais direta que o site oferece: o feed RSS (Bundesliga, CONMEBOL, AF Algarve, AF Lisboa), o sitemap de notícias (Ligue 1, DFB, UEFA), a API pública que a própria página usa (Premier League, FIFA) ou a página da lista (as restantes). As notícias da FPF são numeradas e o servidor vai experimentando o número seguinte. Se um site deixar de responder, ou for montado no browser com JavaScript, a fonte passa para o Google News (com alguns minutos de atraso) e o servidor volta a tentar o site de meia em meia hora. Os títulos que não estão em português são traduzidos pelo Google Tradutor; ao passar o rato fica o título original. O estado de cada fonte está em `/api/oficiais/estado`.

As páginas montadas no browser (como a da Lega Serie A) também se leem pela lista que vem em JSON dentro da própria página; cada fonte pode ter páginas alternativas (`alternativas`, por exemplo a versão italiana) e várias pesquisas do Google News, experimentadas por ordem. As horas escritas sem fuso são lidas no fuso do país da fonte (Roma, Madrid, Paris, Berlim, Londres, São Paulo), e quando a lista só dá o dia, ou não dá data nenhuma, o servidor abre a notícia para ler a hora exata da publicação. As entradas gravadas antes desta correção são datadas de novo, devagar, quando o servidor arranca.

## Resultados de Portugal (nacionais e distritais)

Na secção Resultados, a vista **Portugal** tem todos os campeonatos seniores de futebol e de futsal do país — Liga Portugal, FPF e as 22 associações distritais e regionais — e o campeonato nacional de sub-23. Ficam de fora a formação, os sub-22/sub-23 e esperanças distritais, os veteranos, o futebol de praia, o futebol de 7/9 e o INATEL (regras em `server/pt/catalogo.js`). Tudo é gratuito.

Há quatro vistas, com filtros de modalidade (futebol, futsal), nível (nacionais, distritais) e associação. Todas funcionam haja ou não jogos a decorrer:

- **Competição**: a jornada da semana de uma competição e série, com setas para as anteriores e as seguintes, e a classificação ao lado (ao vivo quando há jogos). A jornada atual muda sozinha de semana para semana (segunda a domingo, hora de Lisboa): é a que tem jogos esta semana; numa semana de pausa, a próxima.
- **Jornadas da semana**: a jornada atual (ou a próxima) de todas as competições ao mesmo tempo, com os jogos, as horas e os resultados que já houver.
- **Jogos de hoje**: todos os jogos do dia, agrupados por competição, os que estão a decorrer primeiro.
- **Todas as tabelas**: as classificações de todos os campeonatos, nacionais e distritais, agrupadas por organizador (FPF, Liga Portugal e cada associação, com atalhos para saltar para cada uma) e com pesquisa por equipa. Uma série que ainda não tem resultados nem tabela oficial aparece com as equipas do calendário a zero.

Os golos, intervalos e finais destes jogos entram nos Acontecimentos (o feed da secção Resultados) e no quadro de resultados, com um filtro por organizador no botão «Escolher ligas» («Portugal · AF Porto», etc.).

### De onde vêm os dados

- **resultados.fpf.pt**: competições de cada associação (os endereços `GetCompetitionsByAssociation?associationId=…&seasonId=106`) e da FPF, séries, jornadas, datas e horas, resultados oficiais e classificações oficiais. O servidor lê tudo uma vez por dia, um pedido de cada vez (1,2 s entre pedidos, `FPF_INTERVALO_MS`). Na primeira vez pode demorar uma a duas horas a ter todas as jornadas de todas as competições; a jornada da semana de cada uma chega primeiro. Durante os jogos, a jornada é relida de 4 em 4 minutos (`FPF_DIRETO_SEGUNDOS`) para apanhar o resultado final assim que a associação o publica; nos três dias seguintes, de 2 em 2 horas.
- **Sofascore**: as competições da Liga Portugal (que não estão no resultados.fpf.pt), e o minuto ao segundo e os marcadores dos jogos nacionais que o Sofascore acompanha.
- **ESPN/Sofascore do `ligas.json`**: os jogos da Liga Betclic, Liga 2, Liga 3, Next Gen, Liga BPI e Taça de Portugal continuam a dar as notícias como antes; aqui alimentam as tabelas ao vivo.
- **Stories e posts dos clubes no Instagram**: o tempo real dos jogos sem transmissão, sobretudo as distritais (ver abaixo).

O `npm run fpf-sonda -- <endereço>` mostra o que o leitor tira de uma página da FPF e grava-a em `data/fpf-sonda/`. O leitor procura padrões que não dependem do aspeto da página (endereços com `competitionId`, `fixtureId` e `matchId`, listas «Jornada N», tabelas com J/V/E/D/GM/GS/P); se a FPF mudar o site e deixarem de aparecer jogos, é por aí que se vê o que mudou. Os endereços das jornadas que o site carrega à parte podem ser trocados no `.env` (`FPF_URL_JORNADA`, com `{id}`). O estado de tudo está em `/api/pt/estado`.

### Tempo real pelos stories

Os clubes não precisam de fazer nada (nem de identificar o site), e **não é preciso criar uma conta para seguir os clubes**. Há três maneiras de os stories e posts chegarem, que se podem usar ao mesmo tempo:

1. **Sem conta nenhuma (o que acontece por omissão).** O Instagram só mostra stories a quem tem sessão iniciada, por isso o VAR pergunta aos «visualizadores anónimos» públicos (imginn, anonyig, storiesig, fastdl…), sites gratuitos que vão buscar os stories de contas públicas. Só se pergunta pelos clubes que estão a jogar, primeiro os jogos a decorrer e os clubes que já se viu publicarem. Há várias fontes experimentadas por ordem; uma que falhe fica de lado 10 minutos e passa-se à seguinte. A lista está em `STORIES_FONTES` no `.env` (endereços com `{u}` no lugar do nome da conta), para se trocar quando um destes sites mudar ou fechar, sem mexer no código. Os posts («Resultado final…») vêm do endereço público do Instagram, que responde sem sessão a um número limitado de pedidos por hora. Estes sites não são oficiais e vão mudando: o estado de cada um está em `/api/pt/estado`, em `instagram.fontes`.
2. **Com a sessão de uma conta qualquer, sem seguir ninguém** (mais rápido e mais fiável). Põe no `.env` o `IG_SESSIONID` de uma conta de Instagram (pode ser uma que já tenhas): no browser, com a sessão iniciada, ferramentas de programador › Armazenamento/Application › Cookies de instagram.com › `sessionid`. Os stories das contas públicas leem-se diretamente, 20 clubes por pedido, só dos que estão a jogar, de minuto a minuto (`IG_DIRETO_SEGUNDOS`). Seguir os clubes é opcional: se a conta os seguir, um pedido à barra dos stories diz logo quem publicou e poupam-se pedidos. Usa uma conta que não te faça falta: a API é a interna do Instagram e uma conta com pedidos a mais pode ser travada (há um limite de 40 por minuto, `IG_PEDIDOS_MINUTO`, e pausas automáticas).
3. **Quem está no campo.** Na vista Portugal, cada jogo sem resultado oficial tem «Enviar resultado»: qualquer pessoa pode mandar o resultado, o minuto, o marcador ou uma captura do story do clube (lida pelo OCR). Não precisa de conta. Para evitar brincadeiras, um envio só conta quando outra pessoa manda o mesmo resultado nos 20 minutos seguintes, ou quando bate com o que os stories ou a FPF já disseram; com `PT_LEITOR_DIRETO=1`, basta um envio (se só pessoas de confiança usarem o formulário). Há um limite de 12 envios por pessoa em 10 minutos.

O texto de cada story vem, por esta ordem: do texto automático que o próprio Instagram gera para as imagens; do **Tesseract** (OCR livre, já instalado na imagem Docker, com português; os vídeos passam pelo ffmpeg, que tira três fotogramas); e, só quando os dois não dão números, do **Gemini** (o mesmo `GEMINI_API_KEY`, no máximo 60 imagens por hora, `STORIES_GEMINI_POR_HORA`).

Cada story ou post é uma **prova**, não uma ordem (`server/pt/stories/evidencia.js`):

- **Stories e posts valem o mesmo, e conta o que chegar primeiro.** Muitos clubes, sobretudo nas distritais, dão os golos e o resultado em posts. Se o story chega primeiro, é ele que cria o golo (com o seu minuto) e o post do mesmo golo conta como confirmação; se o post chega primeiro, é ao contrário. O segundo só junta o que faltava: o nome do marcador ou o minuto escrito. Um clube que só publica posts tem os golos pelos posts.
- **Posts durante o jogo**: leem-se desde o apito inicial, a cada 5 minutos (`IG_POSTS_SEGUNDOS`), e a cada 2 minutos nos clubes que já se viu atualizarem o jogo por post (`IG_POSTS_VIVO_SEGUNDOS`), até 10 clubes por volta (`IG_POSTS_POR_CICLO`) para não gastar os pedidos dos stories. Quando o clube edita a legenda do mesmo post («ATUALIZADO: 2-1»), cada versão conta como uma prova nova.
- **Post de resumo** («Resultado final 2-1 ⚽ Tiago Mendes 12', 80'»): completa os golos do clube com os marcadores e os minutos escritos, pela ordem; se não houve nada durante o jogo (ou só o resultado oficial), cria esses golos. O minuto de um golo que só aparece num post de fim de jogo, sem minuto escrito, fica desconhecido em vez de estimado pela hora do post.

- O resultado só anda para a frente. Um story com um resultado anterior (publicado com atraso) fica como histórico; um que não bate certo fica «a confirmar» até haver outra prova.
- **Confirmação pelo outro clube**: quando o adversário publica o mesmo resultado (mesmo escrito ao contrário, «0-1» em vez de «1-0»), não cria outro golo — conta como confirmação, e o golo passa a dizer «confirmado pelos dois clubes».
- **Quem escreveu o quê**: o visitante tanto escreve «casa-fora» como «nós primeiro». Decide-se pelos nomes das equipas no texto, pela convenção que o sistema vai aprendendo de cada clube (`data/pt-clubes.json`) e pela coerência com o jogo (quem publica «GOLO» costuma ser quem marcou).
- **Minuto**: o que vem escrito no story («23'»). Sem ele, o minuto é estimado pela hora de publicação do story (menos 1 minuto de atraso, `STORY_ATRASO_SEGUNDOS`; num post, 3 minutos, `POST_ATRASO_SEGUNDOS`), contado a partir do story de início do jogo, do de intervalo ou do de recomeço; sem nenhum, a partir da hora marcada. Os minutos estimados aparecem com «~». O minuto a que vai o jogo é calculado da mesma maneira. No futsal, em que o cronómetro para, a conta é proporcional (20 minutos de jogo em perto de 40 reais).
- **Stories perdidos**: de 0-0 para 2-1 criam-se os golos que faltam, com minuto desconhecido, e só o último leva minuto.
- **Clubes que não publicam**: o jogo fica com a hora marcada («a decorrer?» e, depois do fim provável, «à espera do resultado») e recebe o resultado quando um dos clubes o puser num post ou quando a associação o publicar no resultados.fpf.pt. O resultado oficial passa sempre por cima do dos stories (o dos stories fica marcado com «*» até lá).

**Retransmissor**: o Instagram e os visualizadores anónimos desconfiam de pedidos vindos de servidores de alojamento. O `npm run instagram-relay` faz a mesma recolha num computador de casa (com ou sem `IG_SESSIONID`) e envia o texto para o site:

```
VAR_URL=https://o-teu-site PT_TOKEN=uma-chave-tua npm run instagram-relay
```

No servidor põe-se a mesma `PT_TOKEN` e, se a recolha for só em casa, `STORIES_ANONIMO=0`. Com o Tesseract instalado em casa (`brew install tesseract tesseract-lang` ou `sudo apt install tesseract-ocr tesseract-ocr-por`) o OCR corre aí.

A mesma chave dá acesso à API da redação: `POST /api/pt/evidencia` (texto de um story ou post, por exemplo do Facebook, com `conta` ou `jogoId`) e `POST /api/pt/jogo/<id>` (corrigir um resultado à mão). O Facebook não tem forma gratuita e fiável de ser lido de forma automática; os posts do Facebook podem entrar por esta API.

Nenhuma destas vias é uma API oficial do Instagram (a oficial não dá stories de contas de terceiros): os visualizadores anónimos podem deixar de funcionar de um dia para o outro, e uma conta usada para ler stories pode ser travada pelo Instagram. Por isso as três vias coexistem, e o resultado oficial da FPF fecha sempre cada jogo.

### Clubes e redes sociais

O `pt/clubes.json` é feito a partir do Excel `pt/clubes_redes_sociais.xlsx` (a versão com os links encontrados preenchidos, a amarelo e laranja, e a folha «Sem redes» é o `pt/clubes_redes_sociais_atualizado.xlsx`) com `npm run importar-clubes` (precisa de `pip install openpyxl`). Os links que faltavam no Excel e foram encontrados por pesquisa estão em `pt/redes-encontradas.json` (com `alta` ou `media` de confiança) e entram no `clubes.json` só onde o Excel estava vazio. O `pt/clubes-sem-redes.csv` lista os clubes a quem ainda falta o Instagram ou o Facebook (depois de duas pesquisas cada), com as ligações de pesquisa, para se completar à mão. Para os que ainda faltam, o `npm run procurar-redes` faz o que se faria à mão — pesquisa «site:instagram.com "Clube" terra futebol» e fica com o primeiro perfil que tenha o nome do clube — e marca-os como «Pesquisa automática» para serem revistos (`-- --limite 50` para ir aos poucos, `-- --assoc "AF Porto"` para uma associação).

### Classificações

As tabelas são calculadas a partir dos resultados, com os jogos a decorrer incluídos (setas de subida e descida e o resultado ao vivo ao lado da equipa). Desempates: pontos; pontos, diferença de golos e golos marcados nos jogos entre as equipas empatadas; diferença de golos geral; golos marcados. Os castigos e os jogos que o leitor não tenha apanhado são acertados com a tabela oficial: a diferença entre a oficial e a calculada fica guardada e soma-se sempre.

### Variáveis do `.env` (todas opcionais)

| Variável | Para quê |
| --- | --- |
| `IG_SESSIONID` (ou `IG_COOKIE`) | sessão de uma conta de Instagram (opcional; não precisa de seguir os clubes) |
| `STORIES_ANONIMO=0`, `STORIES_FONTES`, `STORIES_ANONIMO_SEGUNDOS`, `STORIES_ANONIMO_PEDIDOS_MINUTO` | modo sem conta: desligar, lista de visualizadores (com `{u}`), ritmo (60 s) e limite de pedidos (30/min) |
| `PT_LEITOR_DIRETO=1` | os resultados enviados pelos leitores contam sem precisar de uma segunda pessoa |
| `PT_TOKEN` | chave do retransmissor e da API da redação |
| `IG_PEDIDOS_MINUTO`, `IG_SEGUNDOS`, `IG_DIRETO_SEGUNDOS` | ritmo da recolha no Instagram com sessão (40/min, 45 s, 60 s) |
| `IG_POSTS_SEGUNDOS`, `IG_POSTS_VIVO_SEGUNDOS`, `IG_POSTS_POR_CICLO`, `POST_ATRASO_SEGUNDOS` | posts dos clubes durante o jogo: de quanto em quanto tempo (300 s; 120 s nos clubes que atualizam por post), quantos por volta (10) e o atraso de um post para estimar o minuto (180 s) |
| `STORIES_GEMINI_POR_HORA` | imagens que podem ir ao Gemini por hora (60; 0 desliga) |
| `STORY_ATRASO_SEGUNDOS` | atraso médio entre o lance e o story (60) |
| `FPF_EPOCA` | época no resultados.fpf.pt (106 = 2026/27) |
| `FPF_INTERVALO_MS`, `FPF_DIRETO_SEGUNDOS`, `FPF_ESTRUTURA_HORAS` | ritmo das leituras da FPF (1200 ms, 240 s, 20 h) |
| `PT_RESULTADOS=0` | desliga tudo isto |
| `EFEMERIDES_MOTOR`, `EFEMERIDES_GEMINI_MODEL` | pesquisa na web de cada dia do «Nesta semana»: `gemini` (gratuito, com a `GEMINI_API_KEY`) ou `claude`; por omissão, o Claude se houver `ANTHROPIC_API_KEY`, senão o Gemini |
| `ANTHROPIC_API_KEY`, `EFEMERIDES_CLAUDE_MODEL`, `EFEMERIDES_CLAUDE_ESFORCO`, `EFEMERIDES_CLAUDE_PESQUISAS` | pesquisa do Claude para o «Nesta semana», opcional e paga (modelo `claude-opus-5-5`, esforço `medium`, 15 pesquisas por dia) |

Os dados ficam em `data/pt.json` (competições e jogos), `data/pt-eventos.json` (acontecimentos) e `data/pt-clubes.json` (o que se aprendeu de cada clube). Os testes correm com `npm test`.
