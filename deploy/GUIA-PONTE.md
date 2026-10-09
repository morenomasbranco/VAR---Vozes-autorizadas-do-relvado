# Ponte no Cloudflare (gratuita)

A FPF, o Sofascore, o Instagram e o Facebook bloqueiam os servidores de alojamento, como o Northflank (respondem 403 ou 429). A ponte é um pequeno programa que corre nos servidores do Cloudflare, de graça: o VAR passa a pedir as páginas através dela, e os pedidos chegam aos sites com os endereços do Cloudflare, que estes sites bloqueiam muito menos. O teu computador não precisa de estar ligado.

> A FPF e o Instagram recusam muitas vezes também o Cloudflare (o Worker não consegue esconder que é um Worker). Junta também a ponte do Google Apps Script e a do Netlify, que saem por outros endereços e também são gratuitas (`deploy/GUIA-PONTE-GOOGLE.md`): o servidor experimenta-as todas e fica, para cada site, com a que ele aceitar.
>
> Se já tinhas a ponte, cola outra vez o `deploy/ponte-cloudflare.js` no Worker (mantendo a tua `CHAVE`): passou a aceitar todos os sites `*.fpf.pt` (as associações) e a dizer o endereço final das páginas.

Tempo: cerca de 10 minutos.

## 1. Criar a conta no Cloudflare

1. Vai a **dash.cloudflare.com/sign-up** e cria uma conta (só email e palavra-passe; não pede cartão).
2. Confirma o email.

## 2. Criar o Worker

1. No menu da esquerda, abre **Compute (Workers) → Workers & Pages** (às vezes aparece só **Workers & Pages**).
2. Carrega em **Create** (ou **Create application**) e depois em **Create Worker** (ou **Start with Hello World!**).
3. Dá-lhe o nome **`var-ponte`** e carrega em **Deploy**.
4. Carrega em **Edit code**.
5. Apaga todo o código que lá está e cola o conteúdo do ficheiro **`deploy/ponte-cloudflare.js`** (abre-o no GitHub, carrega no botão de copiar e cola).
6. Na linha `const CHAVE = "muda-esta-chave";`, troca `muda-esta-chave` por um texto só teu, por exemplo `var-ponte-7k2p9x4q`.
7. Carrega em **Deploy** (canto de cima, à direita).
8. Copia o endereço do Worker, que aparece no topo: algo como `https://var-ponte.o-teu-nome.workers.dev`.

## 3. Ligar o servidor à ponte

No Northflank, no serviço `var`, em **Environment**, junta duas variáveis:

| Variável | Valor |
|---|---|
| `PONTE_URL` | o endereço do Worker (`https://var-ponte.o-teu-nome.workers.dev`) |
| `PONTE_CHAVE` | o texto que puseste na `CHAVE` |

Guarda. O serviço reinicia sozinho.

## 4. Confirmar

Abre `/api/diagnostico` no endereço do teu site:

- em `ponte`, `pedidos` deve ir subindo e `erros` ficar a 0;
- em `portugal.fpf`, deve aparecer um `ultimoOk` e o `ultimoErro` deixa de ser 403;
- na secção Resultados → Portugal, as associações começam a ser lidas.

Se aparecer «a ponte recusou a chave», a `PONTE_CHAVE` do Northflank não é igual à `CHAVE` do Worker.

O plano gratuito do Cloudflare dá 100 000 pedidos por dia; o VAR usa bastante menos. O painel do Worker mostra quantos foram usados.
