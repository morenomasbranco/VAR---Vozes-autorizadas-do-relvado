#!/bin/bash
# Instala o retransmissor do VAR no Mac e põe-no a arrancar sempre que o Mac liga.
# Corre no Terminal:  bash ~/Downloads/var-retransmissor/instalar-mac.command
# (para voltar a entrar nas contas ou mudar a chave, basta correr outra vez)
ORIGEM="$(cd "$(dirname "$0")" && pwd)"
DESTINO="$HOME/.var-retransmissor/programa"
PLIST="$HOME/Library/LaunchAgents/pt.var.retransmissor.plist"
echo ""
echo "== Retransmissor do VAR: instalação no Mac =="
echo ""
NODE="$(command -v node)"
[ -z "$NODE" ] && for c in /usr/local/bin/node /opt/homebrew/bin/node; do [ -x "$c" ] && NODE="$c"; done
if [ -z "$NODE" ]; then
  echo "Falta o Node.js. Instala a versão LTS em https://nodejs.org e volta a correr este instalador."
  exit 1
fi
BIN="$(dirname "$NODE")"

# um retransmissor que já esteja a correr pára, para se poder configurar
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null
sleep 1

# o programa fica numa pasta própria (o macOS não deixa os programas que arrancam sozinhos ler as Transferências)
mkdir -p "$DESTINO" "$HOME/Library/LaunchAgents"
cp "$ORIGEM/retransmissor.js" "$ORIGEM/package.json" "$DESTINO/" || { echo "Não consegui copiar os ficheiros."; exit 1; }
cd "$DESTINO" || exit 1

echo "1/4 A instalar o que o retransmissor precisa (pode demorar um minuto)…"
"$BIN/npm" install --no-audit --no-fund --loglevel=error || { echo "A instalação falhou. Confirma a ligação à internet e corre outra vez."; exit 1; }

if [ -d "/Applications/Google Chrome.app" ] || [ -d "$HOME/Applications/Google Chrome.app" ]; then
  echo "2/4 Google Chrome encontrado: é esse que o retransmissor vai usar."
else
  echo "2/4 Não encontrei o Google Chrome: a descarregar um browser só para o retransmissor (cerca de 150 MB)…"
  "$BIN/npx" playwright install chromium || { echo "Não consegui descarregar o browser. Instala o Google Chrome e corre outra vez."; exit 1; }
fi

echo "3/4 Configuração e entrada nas contas…"
"$NODE" retransmissor.js --so-configurar || exit 1

echo "4/4 A pôr o retransmissor a arrancar sempre que o Mac liga…"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>pt.var.retransmissor</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DESTINO/retransmissor.js</string></array>
  <key>WorkingDirectory</key><string>$DESTINO</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>/dev/null</string>
  <key>StandardErrorPath</key><string>$HOME/.var-retransmissor/erros.log</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$BIN:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
</dict>
</plist>
PL
launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load -w "$PLIST"
sleep 8
echo ""
echo "Pronto. O retransmissor está a correr e vai arrancar sozinho sempre que ligares o Mac."
echo "Aparece um Chrome minimizado na Dock: é o dele, não o feches."
echo "O que ele vai fazendo fica em: $HOME/.var-retransmissor/registo.log"
echo ""
tail -n 5 "$HOME/.var-retransmissor/registo.log" 2>/dev/null
