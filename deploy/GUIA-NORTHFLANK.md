# Pôr o VAR online no Northflank, sem custos

Tempo: cerca de 40 minutos. Depois de publicado, o VAR corre nos servidores do Northflank, sempre ligado, e o teu computador pode estar desligado.

**Antes de começar, tem à mão:**

- um cartão de crédito (só serve para verificação; o plano gratuito Sandbox não cobra nada);
- o ficheiro `var-site.zip`, descompactado;
- as chaves: Gemini (aistudio.google.com), Telegram (`api_id` e `api_hash` de my.telegram.org) e GOAL API (goal-api.com).

## 1. Pôr o projeto no GitHub

O Northflank vai buscar o projeto a um repositório do GitHub e volta a publicá-lo sozinho sempre que o alterares.

1. Cria uma conta em github.com, se ainda não tiveres.
2. Carrega em **New repository**, dá-lhe o nome `var`, escolhe **Private** e cria.
3. Na página do repositório, carrega em **uploading an existing file**.
4. Abre a pasta `var` descompactada, seleciona tudo o que está lá dentro e arrasta para a página (as pastas `server`, `web`, `scripts` e `deploy`, e os ficheiros, incluindo `Dockerfile`, `.dockerignore` e `.gitignore`).
5. Carrega em **Commit changes**.

Nunca envies o ficheiro `.env` para o GitHub. As chaves vão para o Northflank no passo 5.

## 2. Sessão do Telegram (no teu computador, uma vez)

1. Instala o Node.js (versão LTS) a partir de nodejs.org.
2. Abre um terminal (no Windows, o PowerShell) dentro da pasta `var` e corre:

```
npm install
npm run telegram-login
```

3. Responde com o `api_id`, o `api_hash`, o número de telemóvel e o código que o Telegram te enviar.
4. Copia a linha `TG_SESSION=…` que aparece no fim e guarda-a num sítio seguro. Dá acesso à tua conta Telegram, por isso não a partilhes.

## 3. Criar a conta e o projeto no Northflank

1. Vai a northflank.com e cria conta com o GitHub (é o mais simples). Introduz o cartão quando for pedido.
2. Cria um projeto chamado `var`. Na região, escolhe a europeia mais próxima que aparecer. Não precisa de ser em Espanha.
3. Se o Northflank ainda não tiver acesso ao GitHub, liga-o nas definições da conta (Git) e dá acesso ao repositório `var`.

## 4. Criar o serviço

1. No projeto, carrega em **Create new › Service** e escolhe **Combined service**. Dá-lhe o nome `var`.
2. Em **Repository**, escolhe o repositório `var` e o ramo `main`.
3. Em **Build options**, escolhe **Dockerfile**. O ficheiro está na raiz, por isso não é preciso mudar os caminhos.
4. Em **Networking**, confirma que aparece a porta `3001`, com protocolo HTTP e a opção **Publicly expose this port to the internet** ligada. Se não aparecer, carrega em **Add port** e cria-a assim.
5. Em **Resources**, deixa o plano mais pequeno, o que está incluído no Sandbox gratuito.

## 5. Chaves

Ainda na criação do serviço, em **Environment variables** (runtime variables), acrescenta:

| Variável | Valor |
|---|---|
| `GEMINI_API_KEY` | a chave do Gemini |
| `TG_API_ID` | o `api_id` do Telegram |
| `TG_API_HASH` | o `api_hash` do Telegram |
| `TG_SESSION` | o texto depois de `TG_SESSION=` do passo 2 |
| `GOAL_API_KEY` | a chave da GOAL API |

Carrega em **Create service**.

## 6. Primeira publicação

1. O Northflank compila o projeto. Demora uns 3 a 5 minutos, e podes acompanhar em **Builds**.
2. Quando terminar, abre os registos (**Logs**) do serviço. Deves ver linhas como `[VAR] servidor em…`, `[RSS] Record: feed…`, `[Telegram] a ouvir 2 canal(is)` e `[Bluesky] a ouvir 1 conta(s)`.
3. Abre o endereço público do serviço (termina em `.code.run`). É o teu site.

Para confirmar cada fonte e o atraso real, corre `npm run verificar-fontes` no teu computador, dentro da pasta `var`, com um ficheiro `.env` com as mesmas chaves.

## 7. No dia a dia

- **Mudar fontes ou ligas:** no GitHub, abre o `fontes.json` ou o `ligas.json`, carrega no lápis, edita e faz **Commit changes**. O Northflank volta a publicar sozinho em poucos minutos.
- **Atualizar para uma versão nova do projeto:** envia os ficheiros novos para o GitHub da mesma forma que no passo 1. Se alteraste o `fontes.json` ou o `ligas.json`, não os substituas.
- **Ver o que se passa:** registos do serviço no Northflank.
- **Domínio próprio:** se tiveres um, junta-o na porta pública do serviço, e o Northflank trata do HTTPS.

## 8. Para continuar gratuito

- Mantém a conta no plano Sandbox e usa só o plano de recursos incluído. Não acrescentes serviços ou bases de dados pagos.
- A cada nova publicação, as notícias guardadas apagam-se. A recolha inicial volta a trazer as das últimas 3 horas.
- Se nos registos aparecerem reinícios por falta de memória, diz-me, porque há ajustes possíveis para o VAR gastar menos.
