#!/bin/bash
# Desliga o retransmissor do VAR no Mac (deixa de arrancar sozinho) e apaga-o.
PLIST="$HOME/Library/LaunchAgents/pt.var.retransmissor.plist"
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null
rm -f "$PLIST"
rm -rf "$HOME/.var-retransmissor"
echo "O retransmissor foi desligado e apagado."
