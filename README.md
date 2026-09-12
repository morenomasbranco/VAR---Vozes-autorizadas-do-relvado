# VAR — Verified Action Reports

Feed de notícias de desporto em tempo real, feito só com serviços gratuitos.

## De onde vêm as notícias

- **Sites com RSS e agências** (mais de cem fontes no `fontes.json`: imprensa portuguesa — Record, A Bola, O Jogo, Maisfutebol, zerozero, Bola na Rede, Público, JN, DN, Tribuna Expresso, SIC Notícias, CNN Portugal, RTP, TSF, Renascença, SAPO, Observador, Notícias ao Minuto, Canal 11, Sport TV, GoalPoint —, agências de notícias — Lusa, Reuters, Associated Press, AFP, EFE, ANSA, SID —, imprensa estrangeira — BBC, Guardian, Sky Sports, Telegraph, Independent, Mirror, Mail, talkSPORT, The Athletic, Marca, AS, Mundo Deportivo, SPORT, Relevo, Gazzetta, Corriere dello Sport, Tuttosport, Sky Italia, Calciomercato, Di Marzio, kicker, BILD, Sky Deutschland, SPORT1, Sportschau, Transfermarkt, L'Équipe, Foot Mercato, RMC, Le Parisien, ESPN, B/R Football, ge, Olé, Al Jazeera, Arab News —, sites oficiais (FIFA, UEFA, Liga Portugal, FPF, Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, clubes) e jornalistas de referência, seguidos pelo Google News pelo nome). O servidor verifica ao segundo os feeds das fontes marcadas com `"rapido": true`, a cada 15 segundos os restantes e a cada minuto as que são lidas pelo Google News. Se um site pedir calma (resposta 429), abranda sozinho e volta ao ritmo normal quando o site deixar de se queixar.
- **Canais do Telegram** (Fabrizio Romano, B24). As mensagens chegam em um ou dois segundos. Quando o canal republica um post do X, o botão do site abre esse post no X.
- **Contas do Bluesky** (David Ornstein, Fabrizio Romano), pelo stream público do Bluesky, também em segundos.
- **Zapping do zerozero** (`https://www.zerozero.pt/rss/zapping`), lido a cada minuto: diz que canal português transmite cada jogo. O canal aparece ao lado do resultado, com o logótipo, na página inicial, no quadro de resultados e nos cartões com marcador. Os canais estão no `canais.json`: `re` reconhece o nome como vem no feed, `dominio` vai buscar o logótipo e `cor` é a cor de recurso quando o logótipo não carrega. Para usar uma imagem própria, junta `"logo": "https://…"` ao canal. As transmissões de andebol, futsal, femininos e escalões só entram nos cartões da mesma modalidade. O emparelhamento entre o nome que a ESPN usa e o que o zerozero usa é tolerante (Sheffield Utd e Sheffield United, Athletic Club e Athletic Bilbao, Man United e Manchester United, Vitória SC e Vitória de Guimarães, Köln e Cologne), mas exige as duas equipas, o que evita enganos como confundir o Sporting com o Sp. Braga. Os jogos para os quais não se encontrou transmissão ficam listados em `/api/zapping/estado`, no campo `semCanal` — é por aí que se vê que nome está a falhar e se acrescenta ao `NOMES` ou ao `PALAVRAS` do `server/sources/zapping.js`. A grelha é guardada em `data/zapping.json`, para um reinício a meio da tarde não perder as transmissões dos jogos que já saíram do feed.
- **Resultados em direto** (GOAL API): início, golos, intervalo e final dos jogos das ligas do `ligas.json`, publicados como notícias. No site, a secção Resultados tem um botão para cada visitante escolher as ligas que quer ver.

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
