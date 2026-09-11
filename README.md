# VAR — Vozes Autorizadas do Relvado

Feed de notícias de desporto em tempo real, feito só com serviços gratuitos.

## De onde vêm as notícias

- **Sites com RSS** (zerozero e zerozero Transferências, RTP Desporto, SAPO, Notícias ao Minuto, Observador, Record, A Bola, O Jogo, Maisfutebol, Bola na Rede, Canal 11, Flashscore, Renascença, Foot Mercato, B/R Football, BBC Sport, The Guardian, Sky Sports, ESPN, Marca, AS, Gazzetta, L'Équipe, kicker e três comunidades do Reddit). O servidor verifica ao segundo os feeds das fontes marcadas com `"rapido": true` no `fontes.json`, e a cada 15 segundos os restantes. Se um site pedir calma (resposta 429), abranda sozinho e volta ao ritmo normal quando o site deixar de se queixar.
- **Canais do Telegram** (Fabrizio Romano, B24). As mensagens chegam em um ou dois segundos. Quando o canal republica um post do X, o botão do site abre esse post no X.
- **Contas do Bluesky** (David Ornstein), pelo stream público do Bluesky, também em segundos.
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

## Configurar fontes

Tudo está em `fontes.json`:

- `rss`: basta o endereço do site; o servidor encontra o feed sozinho. Se o `verificar-fontes` disser que não o encontrou, procura o link do feed no site e põe-no no campo `feed`.
- `telegram`: o nome público do canal (o que aparece em t.me/…).
- `bluesky`: o nome da conta (…bsky.social).

## Ligas dos resultados

O `ligas.json` define as ligas que o servidor acompanha. Cada liga é reconhecida pelo nome e pelo país. Se uma liga não for reconhecida, corre `npm run ligas -- portugal` para ver o id na GOAL API e junta `"id": "…"` à entrada.

O plano gratuito da GOAL API tem 1.000 pedidos por dia. O servidor lê o calendário do dia e só consulta a API durante os jogos das ligas escolhidas. Nesse tempo, reparte os pedidos que restam: com poucas ligas, verifica a cada 20 segundos; num dia com muitas ligas a jogar desde a manhã até à noite, o intervalo pode subir para 30 a 40 segundos. Quanto menos ligas no `ligas.json`, mais rápido fica.

## Limites a conhecer

- O plano gratuito do Gemini tem limites por minuto e por dia. O servidor junta várias notícias por pedido. Se o limite se esgotar, as notícias saem na mesma, classificadas por palavras-chave e sem tradução, até o limite voltar. No plano gratuito, a Google pode usar o conteúdo enviado para melhorar os modelos.
- Nos feeds RSS, o atraso depende também de o site atualizar o feed. O `verificar-fontes` mostra a idade da notícia mais recente de cada feed.
- Com `npm run verificar-fontes` vês também um exemplo de jogo lido da GOAL API. Se aparecer «formato por reconhecer», o formato da API mudou e é preciso ajustar os nomes dos campos em `server/sources/results.js`.

## Pôr online

```
npm run build
npm start
```

O servidor entrega o site e a API na porta 3001. Tem de estar sempre ligado, por isso serve um computador teu, um Raspberry Pi ou uma máquina virtual gratuita, como a Always Free da Oracle Cloud. Se quiseres o site no Netlify (plano gratuito), o `netlify.toml` já está preparado: cria no Netlify a variável `VITE_API_URL` com o endereço do servidor e põe o endereço do site em `ALLOWED_ORIGIN` no `.env` do servidor.
