#!/usr/bin/env bash
# Instala e arranca o VAR num servidor Ubuntu (por exemplo, Oracle Cloud Always Free).
# Uso:  bash deploy/instalar.sh o-teu-nome.duckdns.org
# Sem domínio (só http://IP):  bash deploy/instalar.sh
# Podes voltar a correr este script depois de atualizar o projeto: o .env e as notícias guardadas ficam.
set -euo pipefail

DOMINIO="${1:-}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
UTILIZADOR="$(whoami)"
export DEBIAN_FRONTEND=noninteractive

echo "== 1/6 Pacotes base"
sudo apt-get update -y
sudo apt-get install -y curl unzip ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

echo "== 2/6 Node.js 22"
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

echo "== 3/6 Memória extra (swap) em máquinas com pouca RAM"
if [ "$(free -m | awk '/Mem:/{print $2}')" -lt 2000 ] && [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "== 4/6 Dependências e site"
cd "$DIR"
npm ci --no-audit --no-fund
npm run build
[ -f .env ] || cp .env.example .env

echo "== 5/6 Serviço do VAR (arranca com a máquina e reinicia se falhar)"
sudo tee /etc/systemd/system/var.service >/dev/null <<EOF
[Unit]
Description=VAR - feed de noticias
After=network-online.target
Wants=network-online.target

[Service]
User=$UTILIZADOR
WorkingDirectory=$DIR
ExecStart=$(command -v node) server/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable var >/dev/null
sudo systemctl restart var

echo "== 6/6 Caddy (HTTPS automático) e portas 80/443"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y caddy
fi
if [ -n "$DOMINIO" ]; then SITE="$DOMINIO"; else SITE=":80"; fi
sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
$SITE {
  encode gzip
  reverse_proxy localhost:3001
}
EOF
sudo systemctl restart caddy

# as imagens Ubuntu da Oracle trazem uma firewall própria que bloqueia tudo menos o SSH
for p in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport "$p" -j ACCEPT
done
command -v netfilter-persistent >/dev/null || sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save >/dev/null

IP="$(curl -fsS https://ifconfig.me || echo 'IP-da-máquina')"
echo
echo "Pronto."
if [ -n "$DOMINIO" ]; then echo "Site: https://$DOMINIO  (o certificado HTTPS pode demorar um minuto na primeira vez)"; else echo "Site: http://$IP"; fi
echo "Falta: preencher o .env (nano $DIR/.env), correr 'npm run telegram-login' e depois 'sudo systemctl restart var'."
echo "Registos em direto: journalctl -u var -f"
