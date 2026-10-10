# Retransmissor do VAR (Mac e Windows)

A FPF só deixa passar browsers verdadeiros, e o Instagram e o Facebook só mostram os posts a quem tem sessão iniciada. Este programa abre um browser próprio no teu computador (o Chrome, ou o Edge no Windows), com as contas secundárias de Instagram e de Facebook iniciadas, e lê por ele o que o site do VAR lhe pedir: notícias e resultados da FPF e das associações, posts do Instagram e do Facebook dos clubes.

- Arranca sozinho sempre que ligas o computador. Não é preciso abrir nada.
- Enquanto o computador estiver ligado e com internet, o site recebe tudo em tempo real. Quando o desligas, o site volta ao Google News e à pesquisa do Gemini, até o voltares a ligar.
- O browser dele aparece minimizado na Dock (Mac) ou na barra de tarefas (Windows). **Não o feches.** Se o fechares, ele volta a abrir-se sozinho.

## Antes de começar

1. **Node.js** instalado (nodejs.org, versão LTS).
2. No Northflank, a variável **`PT_TOKEN`** (a chave). Vais precisar dela durante a instalação.
3. As contas **secundárias** de Instagram e de Facebook. Nunca uses as tuas contas pessoais.

## Instalar no Mac

1. Descomprime o `var-retransmissor.zip` (ficas com a pasta `var-retransmissor` em Transferências).
2. Abre o **Terminal** (Cmd + Espaço, escreve `terminal`), cola isto e carrega Enter:
   ```
   bash ~/Downloads/var-retransmissor/instalar-mac.command
   ```
3. Responde às perguntas:
   - **Endereço do site:** `https://p01--var--tdhb8zl9kmy6.code.run`
   - **Chave:** o valor da `PT_TOKEN` do Northflank
4. Abre-se um browser com três separadores. Entra no **Instagram** e no **Facebook** com as contas secundárias. O separador da FPF só tem de abrir.
5. Volta ao Terminal e carrega **Enter**. O instalador termina sozinho.

## Instalar no Windows

1. Descomprime o `var-retransmissor.zip` (botão direito → **Extrair tudo**).
2. Na pasta `var-retransmissor`, faz dois cliques em **`instalar-windows.bat`**.
   - Se aparecer «O Windows protegeu o seu PC», carrega em **Mais informações → Executar mesmo assim**.
3. Responde às perguntas (endereço do site e chave, como no Mac).
4. Abre-se um browser com três separadores. Entra no **Instagram** e no **Facebook** com as contas secundárias.
5. Volta à janela preta e carrega **Enter**.

## Confirmar que está a funcionar

Abre `https://p01--var--tdhb8zl9kmy6.code.run/api/retransmissor`:
- `"ligado": true`: o retransmissor está ligado ao site;
- em `ligacoes`, `"browser": true` e `"sessoes": {"instagram": true, "facebook": true}`: as duas contas estão iniciadas.

O que ele vai fazendo fica no ficheiro `registo.log`, na pasta `.var-retransmissor` da tua pasta pessoal.

## Voltar a entrar nas contas, ou mudar a chave

Corre outra vez o instalador (`instalar-mac.command` ou `instalar-windows.bat`). Ele para o retransmissor, pergunta tudo de novo e volta a pô-lo a correr.

## Desinstalar

- Mac: `bash ~/Downloads/var-retransmissor/desinstalar-mac.command`
- Windows: dois cliques em `desinstalar-windows.bat`
