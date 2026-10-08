# Ponte de casa (Mac ou Windows)

A FPF, o Instagram e o Facebook recusam os pedidos que vêm de servidores (do Northflank e até do Cloudflare), mas respondem a uma ligação de casa. A ponte de casa é um pequeno programa que corre num computador teu: o servidor do VAR passa-lhe os pedidos a esses sites, o computador faz os pedidos pela tua internet e devolve as respostas. O resto do site continua no Northflank.

Enquanto o computador estiver ligado com a ponte a correr, os resultados da FPF, as Distritais e os stories e posts dos clubes chegam ao site. Quando o desligares, o site continua no ar, só deixa de receber estas atualizações até a ponte voltar. Enquanto a ponte corre, o computador não adormece sozinho.

Tempo: cerca de 10 minutos, uma vez.

## 1. A chave PT_TOKEN no Northflank

1. No Northflank, no serviço `var`, abre **Environment**.
2. Se ainda não houver `PT_TOKEN`, junta-a com um texto só teu, por exemplo `var-casa-5h8k2m9q`, e guarda.
3. Guarda esse texto: a ponte vai pedi-lo na primeira vez.

## 2. Instalar o Node.js

Vai a **nodejs.org**, descarrega a versão **LTS** e instala (no Mac é um ficheiro `.pkg`, no Windows um `.msi`; é sempre «Seguinte»/«Continuar» até ao fim).

## 3. Descarregar a ponte

No GitHub do projeto, abre a pasta `scripts` e descarrega (botão **Download raw file**, a seta para baixo em cima à direita do código):

- `ponte-casa.js` (Mac e Windows);
- `ponte-casa.bat` (só no Windows).

Põe os ficheiros numa pasta tua, por exemplo **Documentos → VAR** (no Windows, os dois na mesma pasta).

## 4a. Arrancar no Windows

1. Faz **duplo clique** no `ponte-casa.bat`.
   - Se o Windows mostrar «O Windows protegeu o seu PC», carrega em **Mais informações → Executar mesmo assim**.
2. Na primeira vez, a janela pede o **endereço do site** (por exemplo `https://o-teu-site.code.run`) e a **chave PT_TOKEN**. Escreve cada um e carrega em Enter. Ficam guardados para as vezes seguintes.
3. Deve aparecer: `Ponte de casa ligada a …`. Deixa a janela aberta (podes minimizá-la).

Para parar: fecha a janela. Para voltar a ligar: duplo clique no `ponte-casa.bat` outra vez.

Para arrancar sozinha quando ligas o computador: carrega em `Windows + R`, escreve `shell:startup`, Enter, e copia para essa pasta um **atalho** do `ponte-casa.bat` (botão direito no ficheiro → Mostrar mais opções → Criar atalho, e arrasta o atalho para lá).

## 4b. Arrancar no Mac

1. Abre o **Terminal**: `Cmd + Espaço`, escreve `Terminal`, Enter.
2. Escreve `cd ` (com um espaço no fim), arrasta para a janela do Terminal a pasta onde puseste o `ponte-casa.js`, e carrega em Enter.
3. Escreve `node ponte-casa.js` e carrega em Enter.
4. Na primeira vez, pede o **endereço do site** e a **chave PT_TOKEN**. Ficam guardados para as vezes seguintes.
5. Deve aparecer: `Ponte de casa ligada a …`. Deixa a janela aberta (podes minimizá-la). Mantém o Mac ligado à corrente e com a tampa aberta.

Para parar: `Ctrl + C` na janela do Terminal. Para voltar a ligar: repete os passos 1 a 3 (o Terminal lembra-se dos comandos: seta para cima ↑ e Enter).

## 5. Confirmar

Abre `/api/diagnostico` no endereço do teu site. Em `ponte.casa`, `ligada` deve estar `true` e `pedidos` vai subindo. Na secção Resultados → Portugal, as associações começam a ser lidas; nas Distritais, as colunas começam a encher.

Se a janela da ponte disser «O site recusou a chave», a chave não é igual à `PT_TOKEN` do Northflank: apaga o ficheiro `ponte-casa.json` (na mesma pasta) e arranca a ponte outra vez para a escrever de novo.
