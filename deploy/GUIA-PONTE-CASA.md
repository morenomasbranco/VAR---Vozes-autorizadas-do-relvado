# Ponte de casa (no Mac)

A FPF, o Instagram e o Facebook recusam os pedidos que vêm de servidores (do Northflank e até do Cloudflare), mas respondem a uma ligação de casa. A ponte de casa é um pequeno programa que corre no teu Mac: o servidor do VAR passa-lhe os pedidos a esses sites, o Mac faz os pedidos pela tua internet e devolve as respostas. O resto do site continua no Northflank.

Enquanto o Mac estiver ligado com a ponte a correr, os resultados da FPF, as Distritais e os stories e posts dos clubes chegam ao site. Quando o desligares, o site continua no ar, só deixa de receber estas atualizações até a ponte voltar.

Tempo: cerca de 10 minutos, uma vez.

## 1. A chave PT_TOKEN no Northflank

A ponte usa a chave `PT_TOKEN` para o servidor saber que é o teu Mac.

1. No Northflank, no serviço `var`, abre **Environment**.
2. Se ainda não houver `PT_TOKEN`, junta-a com um texto só teu, por exemplo `var-casa-5h8k2m9q`, e guarda.
3. Guarda esse texto: vais precisar dele no passo 4.

## 2. Instalar o Node.js no Mac

1. Vai a **nodejs.org** e descarrega a versão **LTS** para macOS (o ficheiro `.pkg`).
2. Abre o ficheiro e segue o instalador (Continuar, Continuar, Instalar).

## 3. Descarregar a ponte

1. Abre no GitHub o ficheiro `scripts/ponte-casa.js` do projeto.
2. Carrega no botão **Download raw file** (a seta para baixo, em cima à direita do código).
3. O ficheiro fica na pasta **Transferências** (Downloads) com o nome `ponte-casa.js`.

## 4. Pôr a ponte a correr

1. Abre o **Terminal**: `Cmd + Espaço`, escreve `Terminal` e carrega em Enter.
2. Escreve isto, trocando o endereço e a chave pelos teus, e carrega em Enter:

```
cd ~/Downloads && caffeinate -i node ponte-casa.js https://o-teu-site.code.run A-TUA-PT_TOKEN
```

3. Deve aparecer: `Ponte de casa ligada a https://o-teu-site.code.run. Deixa esta janela aberta.`
4. Deixa a janela do Terminal aberta (podes minimizá-la). O `caffeinate` impede o Mac de adormecer enquanto a ponte corre. Mantém o Mac ligado à corrente e com a tampa aberta.

Para parar: carrega em `Ctrl + C` na janela do Terminal. Para voltar a ligar, repete o passo 4 (o Terminal lembra-se do comando: carrega na seta para cima ↑ e em Enter).

## 5. Confirmar

Abre `/api/diagnostico` no endereço do teu site. Em `ponte.casa`:

- `ligada` deve estar `true`;
- `pedidos` vai subindo.

Na secção Resultados → Portugal, as associações começam a ser lidas; nas Distritais, as colunas começam a encher.

Se o Terminal disser «O site recusou a chave», a chave escrita no comando não é igual à `PT_TOKEN` do Northflank.
