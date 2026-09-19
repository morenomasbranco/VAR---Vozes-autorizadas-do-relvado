# Pôr o VAR online na Oracle Cloud, sem custos

Tempo: cerca de 45 minutos. O teu computador só é preciso durante a configuração. Depois, o VAR corre na máquina da Oracle, 24 horas por dia.

**Antes de começar, tem à mão:**

- um cartão de crédito (só serve para verificar a identidade; não aceitam cartões pré-pagos nem virtuais) e o telemóvel;
- o ficheiro `var-site.zip`;
- as chaves: Gemini (aistudio.google.com), Telegram (`api_id` e `api_hash` de my.telegram.org) e GOAL API (goal-api.com).

## 1. Criar a conta

1. Vai a oracle.com/cloud/free e escolhe «Start for free».
2. Na região principal (home region), escolhe uma perto de Portugal, como Madrid ou Frankfurt. Os recursos gratuitos só existem nessa região e não a podes mudar depois.
3. Introduz o cartão. Pode aparecer uma retenção temporária, que o banco anula em poucos dias.
4. Não passes a conta para «Pay As You Go» por agora. A secção 9 explica quando pode compensar.

## 2. Criar a máquina

1. No menu, abre Compute › Instances › Create instance.
2. Em **Name**, escreve `var`.
3. Em **Image**, carrega em Change image e escolhe Canonical Ubuntu 24.04.
4. Em **Shape**, carrega em Change shape › Ampere › VM.Standard.A1.Flex e define **1 OCPU e 2 GB de memória**. Fica dentro do gratuito e chega para o VAR. A memória pequena é de propósito (vê a secção 9).
   - Se aparecer «Out of capacity», muda de availability domain, tenta mais tarde ou escolhe VM.Standard.E2.1.Micro (AMD), que também é gratuita.
5. Em **Networking**, deixa criar uma rede nova com subnet pública e confirma que «Assign a public IPv4 address» está ligado.
6. Em **Add SSH keys**, escolhe «Generate a key pair for me» e carrega em **Save private key**. Guarda esse ficheiro `.key`, porque sem ele não entras na máquina.
7. Carrega em **Create**. Quando o estado passar a Running, copia o **Public IP address**.

## 3. Abrir as portas do site na rede da Oracle

1. Na página da máquina, abre a subnet (em Primary VNIC) › Security Lists › Default Security List.
2. Carrega em **Add Ingress Rules** e preenche: Source CIDR `0.0.0.0/0`, IP Protocol `TCP`, Destination Port Range `80,443`.
3. Guarda. A firewall dentro do Ubuntu fica aberta pelo script de instalação.

## 4. Nome gratuito para o site (DuckDNS)

1. Vai a duckdns.org e entra com uma conta Google, GitHub ou outra.
2. Escreve um nome, por exemplo `var-noticias`, e carrega em add domain.
3. No campo current ip, põe o IP público da máquina e carrega em update ip.

O site vai ficar em `https://var-noticias.duckdns.org`. Se tiveres um domínio teu, cria um registo A a apontar para o IP e usa esse.

## 5. Enviar o projeto para a máquina

**Windows (PowerShell)**, na pasta onde tens a chave e o zip (troca `IP` pelo IP da máquina e `ssh-key.key` pelo nome do teu ficheiro):

```
icacls .\ssh-key.key /inheritance:r
icacls .\ssh-key.key /grant:r "$($env:USERNAME):(R)"
scp -i .\ssh-key.key .\var-site.zip ubuntu@IP:~
ssh -i .\ssh-key.key ubuntu@IP
```

**Mac ou Linux:**

```
chmod 600 ssh-key.key
scp -i ssh-key.key var-site.zip ubuntu@IP:~
ssh -i ssh-key.key ubuntu@IP
```

À pergunta «Are you sure you want to continue connecting?», responde `yes`.

## 6. Instalar

Já dentro da máquina:

```
sudo apt-get update && sudo apt-get install -y unzip
unzip var-site.zip
cd var
bash deploy/instalar.sh var-noticias.duckdns.org
```

O script instala o Node.js e as dependências, compila o site e cria o serviço que arranca o VAR sempre que a máquina liga. Instala também o Caddy, que trata do HTTPS sozinho, e abre as portas 80 e 443. Demora uns cinco minutos.

## 7. Chaves e Telegram

```
nano .env
```

Preenche `GEMINI_API_KEY`, `TG_API_ID`, `TG_API_HASH` e `GOAL_API_KEY`. Para guardar, carrega em Ctrl+O e Enter, e para sair, em Ctrl+X. Depois:

```
npm run telegram-login
```

Responde com o número de telemóvel e o código que o Telegram te enviar. No fim aparece uma linha `TG_SESSION=…`. Volta a abrir o `.env` com `nano .env`, cola essa linha no sítio da `TG_SESSION` e guarda.

```
npm run verificar-fontes
sudo systemctl restart var
```

Abre `https://var-noticias.duckdns.org`. Na primeira vez, o certificado HTTPS pode demorar um minuto.

## 8. No dia a dia

Para entrar na máquina, usa o mesmo comando `ssh` do passo 5.

| Para… | Comando |
|---|---|
| ver o que o servidor está a fazer | `journalctl -u var -f` (sair: Ctrl+C) |
| ver números (notícias, fila, erros) | `curl localhost:3001/api/status` |
| mudar fontes ou ligas | `nano fontes.json` ou `nano ligas.json`, e depois `sudo systemctl restart var` |
| reiniciar o VAR | `sudo systemctl restart var` |

**Atualizar para uma versão nova do projeto.** Envia o zip novo como no passo 5. Se alteraste o `fontes.json` ou o `ligas.json`, guarda uma cópia antes, porque o zip traz as versões originais. Depois, dentro da máquina:

```
unzip -o var-site.zip
cd var
bash deploy/instalar.sh var-noticias.duckdns.org
```

O `.env` e as notícias guardadas ficam como estavam.

## 9. Para não pagar nada e não perder a máquina

- Usa só shapes com a indicação «Always Free-eligible».
- Em Billing › Budgets, cria um alerta de orçamento de 1 €. Se alguma coisa começar a custar dinheiro, recebes um email.
- **Máquinas paradas.** A Oracle pode recuperar máquinas gratuitas que passem 7 dias com processador, rede e memória todos abaixo de 20%. O VAR gasta pouco processador, e por isso a máquina tem só 2 GB de memória: o sistema e o VAR ocupam uma parte suficiente para ela não contar como parada. Ao fim de uns dias, confirma em Compute › Instances › var › Metrics que a «Memory Utilization» está acima de 20%.
  - Se estiver abaixo, reduz a memória para 1 GB (Edit › Shape).
  - A outra forma de evitar a recuperação é passar a conta para Pay As You Go. A Oracle diz que, assim, não cobra nada enquanto ficares dentro dos limites gratuitos. Se o fizeres, mantém o alerta de orçamento.
- Se a máquina for recuperada, o disco costuma ficar guardado. Nesse caso, basta criar outra máquina a partir dele e voltar a apontar o DuckDNS para o novo IP.
