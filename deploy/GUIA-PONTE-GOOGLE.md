# Pontes gratuitas, sem computador ligado

A FPF (resultados.fpf.pt, www.fpf.pt e os sites das 22 associações), o Instagram e o Facebook recusam os pedidos que vêm do servidor do VAR (Northflank). Uma **ponte** é um pequeno programa que corre de graça nos servidores de outra empresa e faz esses pedidos pelo VAR, a partir de outros endereços. Não precisas de ter nenhum aparelho ligado.

Há três pontes gratuitas, e podes ter todas ao mesmo tempo: o servidor experimenta-as por ordem em cada site e fica com a que esse site aceitar (as recusadas ficam de lado 15 minutos). Quanto mais pontes, maior a probabilidade de passar.

| Ponte | Sai pelos endereços de | Limite gratuito | Guia |
|---|---|---|---|
| **Google Apps Script** | Google | 20 000 pedidos por dia | abaixo |
| Cloudflare Worker | Cloudflare | 100 000 pedidos por dia | `deploy/GUIA-PONTE.md` |
| Netlify Function | Netlify (Amazon) | 125 000 pedidos por mês | abaixo |

O servidor nunca passa do limite gratuito de cada uma: conta os pedidos do dia e, quando chega perto, deixa essa ponte até ao dia seguinte. 30% de cada limite fica sempre guardado para a FPF (notícias, comunicados e resultados), para o Instagram e o Facebook não o gastarem todo.

Não há forma de saber de antemão que ponte cada site aceita: depois de as ligares, o `/api/retransmissor` mostra, em `encaminhamento.porSite`, por onde está a passar cada site.

## Ponte no Google Apps Script (cerca de 5 minutos)

1. Abre **script.google.com** com a tua conta Google (uma conta normal, gratuita) e carrega em **Novo projeto**.
2. Apaga o que está no editor e cola o conteúdo do ficheiro **`deploy/ponte-google.gs`**.
3. Na linha `var CHAVE = "muda-esta-chave";`, troca `muda-esta-chave` por um texto só teu, por exemplo `var-google-5t8m2x7c`.
4. Carrega no ícone de guardar. Dá ao projeto o nome `var-ponte`.
5. Carrega em **Implementar → Nova implementação**. Na roda dentada, escolhe **Aplicação Web**, e preenche:
   - Executar como: **Eu**
   - Quem tem acesso: **Qualquer pessoa**
6. Carrega em **Implementar**. A Google pede autorização: escolhe a tua conta → **Avançadas** → **Aceder a var-ponte (não seguro)** → **Permitir**. (O aviso aparece em todos os scripts que não foram verificados pela Google; o script só faz pedidos aos sites da lista que está nele.)
7. Copia o **URL da aplicação Web** (acaba em `/exec`).
8. No Northflank, no serviço `var`, em **Environment**, junta:

   | Variável | Valor |
   |---|---|
   | `PONTE_GOOGLE_URL` | o URL que copiaste (`https://script.google.com/macros/s/…/exec`) |
   | `PONTE_GOOGLE_CHAVE` | o texto que puseste na `CHAVE` |

   Guarda (o serviço reinicia sozinho).

Se um dia mudares o código do script, faz **Implementar → Gerir implementações → editar → Versão: Nova versão**, para o URL continuar o mesmo.

## Ponte no Netlify (se o site já estiver no Netlify)

A função `netlify/functions/ponte.mjs` é publicada com o site, sem mais nada.

1. No Netlify, em **Site configuration → Environment variables**, junta `PONTE_CHAVE` com um texto só teu, e volta a publicar o site (**Deploys → Trigger deploy**).
2. No Northflank, junta o endereço `https://<o-teu-site>.netlify.app/ponte` à variável `PONTE_URL` (se já lá estiver o do Cloudflare, separa os dois com uma vírgula) e põe o mesmo texto em `PONTE_CHAVE`. Se usares as duas pontes (Cloudflare e Netlify), a `CHAVE` do Worker e a `PONTE_CHAVE` do Netlify têm de ser iguais.

## Confirmar

Abre `https://o-endereço-do-servidor/api/retransmissor`:

- em `encaminhamento.pontes` aparece cada ponte, com os pedidos de hoje e o limite;
- em `encaminhamento.porSite` aparece, para cada site (www.fpf.pt, resultados.fpf.pt, www.instagram.com…), a ponte que funcionou;
- em `encaminhamento.deLado` aparecem as pontes que um site recusou nos últimos 15 minutos.

Se, para um site, aparecerem todas as pontes em `deLado` durante horas, esse site está a bloquear também esses endereços. Nesse caso a única via gratuita que nunca falha é a ligação de uma casa: um telemóvel Android antigo, ligado ao carregador e ao Wi-Fi, com o retransmissor (`deploy/GUIA-RETRANSMISSOR.md`). Não é preciso computador.
