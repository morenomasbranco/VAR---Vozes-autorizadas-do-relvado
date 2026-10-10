# Instagram pela API oficial da Meta (grátis)

A API oficial da Meta (Graph API, «Business Discovery») deixa uma conta profissional de Instagram ler os posts públicos de **outras contas profissionais**: clubes, FPF e associações. Como é a API oficial, o servidor não é bloqueado e nenhuma conta fica em risco.

Limites:
- só lê contas **profissionais** (Empresa ou Criador); as contas pessoais ficam de fora;
- lê os posts, mas não os stories;
- cerca de 150 a 200 pedidos por hora, por isso cada clube é relido de poucas em poucas horas.

Tempo: cerca de 20 minutos. Os nomes dos botões podem variar um pouco, porque a Meta muda os ecrãs com frequência.

## 1. Passar a conta de Instagram a profissional

Usa a conta **secundária**.

1. Na app do Instagram, abre o teu **perfil** → menu **☰** → **Definições e privacidade**.
2. Procura **Tipo de conta e ferramentas** (ou **Ferramentas para criadores**) → **Mudar para conta profissional**.
3. Escolhe **Criador**, uma categoria qualquer (por exemplo, «Desporto») e conclui.

É grátis e pode ser desfeito quando quiseres.

## 2. Criar uma página de Facebook e ligá-la ao Instagram

1. Em **facebook.com/pages/create**, cria uma página (por exemplo, «VAR Distritais»). Pode ser com a tua conta pessoal de Facebook, porque a API oficial não põe a conta em risco.
2. Na página: **Definições** → **Contas ligadas** (ou **Instagram**) → **Ligar conta** → entra com a conta de Instagram do passo 1.

## 3. Criar a app na Meta

1. Em **developers.facebook.com**, carrega em **Começar** e regista-te como programador (com a mesma conta de Facebook).
2. **As minhas apps** → **Criar app**:
   - caso de utilização: **Outro**;
   - tipo: **Empresa**;
   - nome: `VAR`.
3. No painel da app, junta o produto **Instagram** e escolhe a configuração **API com início de sessão do Facebook** (em inglês, «API setup with Facebook login»).

A app pode ficar em **modo de desenvolvimento**. Não é preciso publicá-la.

## 4. Tirar a chave e o número da conta

1. Abre o **Graph API Explorer**: developers.facebook.com/tools/explorer
2. À direita:
   - em **App da Meta**, escolhe a app `VAR`;
   - em **Utilizador ou página**, escolhe **Token de acesso do utilizador**;
   - em **Permissões**, junta `instagram_basic`, `pages_show_list`, `pages_read_engagement` e `business_management`.
3. Carrega em **Generate Access Token**. Entra e autoriza a página e a conta de Instagram.
4. Na caixa de pedido, escreve `me/accounts?fields=name,instagram_business_account` e carrega em **Submit**. Copia o número que aparece em `instagram_business_account` → `id` (começa normalmente por 1784…). Este é o **IG_GRAPH_USER_ID**.
5. Para a chave durar 60 dias em vez de uma hora:
   - abre o **Access Token Debugger** (developers.facebook.com/tools/debug/accesstoken);
   - cola a chave e carrega em **Debug**;
   - no fundo, carrega em **Extend Access Token** e copia a chave nova. Esta é a **IG_GRAPH_TOKEN**.
6. Para o servidor renovar a chave sozinho antes dos 60 dias: no painel da app → **Definições da app** → **Básicas**, copia o **ID da app** e a **Chave secreta da app** (carrega em «Mostrar»).

## 5. Pôr no Northflank

No serviço `var` → **Environment**, junta estas variáveis:

| Variável | Valor |
|---|---|
| `IG_GRAPH_TOKEN` | a chave do passo 4.5 |
| `IG_GRAPH_USER_ID` | o número do passo 4.4 |
| `FB_APP_ID` | o ID da app (passo 4.6) |
| `FB_APP_SECRET` | a chave secreta da app (passo 4.6) |

Apaga também `IG_SESSIONID`, `IG_CSRFTOKEN` e `IG_DS_USER_ID`, se ainda lá estiverem: deixam de ser precisas. Guarda; o serviço reinicia sozinho.

A chave do passo 4.5 dura 60 dias. Com o `FB_APP_ID` e o `FB_APP_SECRET`, o servidor renova-a sozinho uma vez por semana e guarda a nova na pasta `data/`. Se o Northflank apagar essa pasta a cada publicação (serviço sem volume) e passarem mais de 60 dias, a chave do Northflank expira: o teste do passo 6 passa a dizer «chave inválida ou expirada», e basta repetir os passos 4.1 a 4.5.

Estas chaves dão acesso à tua app e à tua página. **Não as coles em lado nenhum além do Northflank.**

## 6. Confirmar

Abre `https://o-endereço-do-servidor/api/distritais/teste-instagram-api?conta=fcporto`:

- **`"funciona": true`** com os 3 últimos posts do FC Porto: está a funcionar. Na secção Distritais aparece «Instagram (API oficial da Meta)», e os posts dos clubes vão chegando ao longo das próximas horas.
- **`"funciona": false`**: o campo `erro` explica o que falta, e `respostaDaMeta` traz a mensagem original. Os casos mais comuns:
  - **chave inválida ou expirada:** repete o passo 4;
  - **falta uma permissão:** volta ao passo 4.2 e confirma as quatro permissões;
  - **essa conta não é profissional:** experimenta com outra conta (por exemplo `?conta=fpf`).
