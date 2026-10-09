# Retransmissor de casa (opcional)

> Primeiro experimenta as pontes gratuitas, que não precisam de nenhum aparelho ligado: `deploy/GUIA-PONTE-GOOGLE.md`. O retransmissor só é preciso se um site recusar também todas as pontes; nesse caso, a forma mais simples é um telemóvel Android antigo, ligado ao carregador e ao Wi-Fi (passo 3), sem computador.

A FPF (resultados.fpf.pt, www.fpf.pt e os sites das 22 associações), o Instagram e o Facebook bloqueiam os servidores de alojamento como o Northflank (respondem 403 ou 429), e muitas vezes bloqueiam também o Cloudflare. A partir de uma ligação de casa, respondem normalmente.

O retransmissor é um pequeno programa (`scripts/retransmissor.js`, um só ficheiro, sem instalar mais nada) que corre num computador de casa, num Raspberry Pi ou num telemóvel Android. Liga-se ao servidor do VAR e faz por ele os pedidos a esses sites, em tempo real. Não é preciso abrir portas no router nem ter IP fixo: é o retransmissor que se liga ao servidor e volta a ligar-se sozinho se a internet falhar.

Com ele ligado:

- **Ligas e Federações**: as notícias e os comunicados da FPF são lidos diretamente no site da FPF, a cada minuto, em vez de chegarem com atraso pelo Google News;
- **Distritais**: os posts do Instagram e do Facebook dos clubes chegam pela ligação de casa (um perfil a cada 20 s, uma página de Facebook a cada 8 s), e cada post novo aparece no site no mesmo instante. As notícias e os comunicados das associações também são lidos nos sites delas;
- **Resultados → Portugal**: o servidor lê no resultados.fpf.pt as competições, as jornadas, os resultados oficiais e as classificações da FPF e das 22 associações, e volta a ler as jornadas de 4 em 4 minutos durante os jogos.

Tempo: cerca de 10 minutos.

## 1. Chave no servidor

No Northflank, no serviço `var`, em **Environment**, confirma que existe a variável `PT_TOKEN` (é a mesma do retransmissor dos stories). Se não existir, cria-a com um texto só teu, por exemplo `var-casa-8h3k2p9q`. Guarda (o serviço reinicia sozinho).

## 2. No computador de casa (Windows, Mac ou Linux)

1. Instala o **Node.js 22** (ou mais recente) em **nodejs.org** (botão «LTS»).
2. Descarrega o ficheiro `scripts/retransmissor.js` do GitHub (abre-o, carrega em «Download raw file») e guarda-o numa pasta, por exemplo `Documentos/var`.
3. Abre o terminal nessa pasta e corre:

   **Windows (PowerShell)**

   ```
   $env:VAR_URL="https://o-endereço-do-teu-site"; $env:PT_TOKEN="a-tua-chave"; node retransmissor.js
   ```

   **Mac ou Linux**

   ```
   VAR_URL=https://o-endereço-do-teu-site PT_TOKEN=a-tua-chave node retransmissor.js
   ```

   (Se tiveres o projeto todo no computador, basta `npm run retransmissor` com estas duas variáveis no `.env`.)

4. Deve aparecer `[retransmissor] ligado a https://… como «…»`. Deixa a janela aberta. A cada 5 minutos aparece um resumo dos pedidos feitos.

O computador tem de ficar ligado (e sem entrar em suspensão) para os dados continuarem a chegar. Quando se desliga, o site volta a usar a ESPN, a pesquisa na web e o Google News, como antes.

## 3. Ou num telemóvel Android antigo (sempre ligado ao carregador)

1. Instala o **Termux** a partir do F-Droid (f-droid.org); a versão da Play Store está desatualizada.
2. No Termux:

   ```
   pkg update && pkg install nodejs
   termux-wake-lock
   ```

3. Copia o `retransmissor.js` para o telemóvel (por exemplo para `~/retransmissor.js`) e corre:

   ```
   VAR_URL=https://o-endereço-do-teu-site PT_TOKEN=a-tua-chave node retransmissor.js
   ```

Num Raspberry Pi é igual ao Linux. Podes ter vários retransmissores ligados ao mesmo tempo (por exemplo o computador e o telemóvel): o servidor reparte os pedidos e, se um se desligar, usa o outro.

## 4. Confirmar

- Abre `https://o-endereço-do-teu-site/api/retransmissor`: `ligado` deve estar a `true` e `pedidos` a subir. Em `encaminhamento.porSite` vês por que caminho foi lido cada site (`casa`, `ponte` ou `direto`).
- Na secção Resultados → Portugal, as associações começam a ser lidas no mesmo minuto («associações lidas na FPF: 3 de 23…»).
- Na secção Distritais aparece «Retransmissor de casa ligado».

Se aparecer `ligação fechada` sem parar, a `PT_TOKEN` do computador não é igual à do servidor, ou o `VAR_URL` está errado (tem de ser o endereço do servidor, o mesmo onde abre o `/api/diagnostico`).

## Opcional

| Variável (no computador de casa) | Para quê |
|---|---|
| `RETRANSMISSOR_NOME` | nome que aparece no `/api/retransmissor` (por omissão, o nome do computador) |
| `RETRANSMISSOR_PARALELO` | pedidos ao mesmo tempo (4) |
| `RETRANSMISSOR_HOSTS` | sites que este retransmissor aceita fazer (por omissão, só os que bloqueiam o servidor: FPF, Instagram, Facebook, Sofascore…) |
| `IG_SESSIONID`, `FB_COOKIE` | sessão de Instagram / cookies de Facebook usados em casa, se o servidor não mandar os seus |

**Segurança.** O retransmissor só faz pedidos aos sites da lista, por isso o servidor não o pode usar para mais nada. A ligação é cifrada (https/wss) e só é aceite com a `PT_TOKEN`. O tráfego é pequeno: algumas dezenas de MB por dia.
