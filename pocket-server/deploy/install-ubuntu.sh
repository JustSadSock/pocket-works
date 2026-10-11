#!/usr/bin/env bash
# PocketNet: install or upgrade a private Node.js server behind Caddy on Ubuntu 24.04.
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive

if [[ ${EUID} -ne 0 ]]; then
  echo 'Run as root: sudo env POCKET_DOMAIN=... POCKET_SITE_ORIGIN=https://... bash install-ubuntu.sh' >&2
  exit 1
fi
if [[ -z "${POCKET_DOMAIN:-}" || ! "${POCKET_DOMAIN}" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$ || "${POCKET_DOMAIN}" != *.* ]]; then
  echo 'Set POCKET_DOMAIN to a public DNS hostname (for example 203-0-113-24.sslip.io).' >&2
  exit 1
fi
if [[ -z "${POCKET_SITE_ORIGIN:-}" || ! "${POCKET_SITE_ORIGIN}" =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]]; then
  echo 'Set POCKET_SITE_ORIGIN to the exact HTTPS origin of Pocket Works (no path or trailing slash).' >&2
  exit 1
fi
if [[ -f /etc/os-release ]]; then
  . /etc/os-release
else
  echo 'This installer supports Ubuntu only.' >&2; exit 1
fi
if [[ "${ID}" != "ubuntu" || "${VERSION_ID}" != "24.04" ]]; then
  echo 'Expected Ubuntu 24.04 LTS. Do not use this installer on an untested distribution.' >&2
  exit 1
fi
if ! command -v apt-get >/dev/null; then
  echo 'apt-get not available.' >&2; exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gnupg git openssl caddy
install -d -m 755 /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
chmod 644 /etc/apt/keyrings/nodesource.gpg
printf 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main\n' > /etc/apt/sources.list.d/nodesource.list
apt-get update
apt-get install -y nodejs
node -e "if (Number(process.versions.node.split('.')[0]) < 22) process.exit(1)"

repo=/opt/pocket-works
if [[ -d "${repo}/.git" ]]; then
  git -C "${repo}" pull --ff-only origin main
elif [[ -e "${repo}" ]]; then
  echo "Refusing to overwrite ${repo}: directory already exists without .git" >&2
  exit 1
else
  git clone --depth 1 --branch main https://github.com/JustSadSock/pocket-works.git "${repo}"
fi
npm ci --prefix "${repo}/pocket-server" --omit=dev --no-audit --no-fund

if ! id pocketserver &>/dev/null; then
  useradd --system --home-dir /var/lib/pocket-server --shell /usr/sbin/nologin pocketserver
fi
install -d -o pocketserver -g pocketserver -m 750 /var/lib/pocket-server
file=/etc/pocket-server.env
auth_secret=''
deploy_token=''
if [[ -f "${file}" ]]; then
  auth_secret="$(sed -n 's/^POCKET_AUTH_SECRET=//p' "${file}" | head -n 1)"
  deploy_token="$(sed -n 's/^POCKET_DEPLOY_TOKEN=//p' "${file}" | head -n 1)"
fi
auth_secret="${auth_secret:-$(openssl rand -hex 32)}"
deploy_token="${deploy_token:-$(openssl rand -hex 32)}"
umask 077
cat > "${file}" <<ENV
NODE_ENV=production
PORT=8788
POCKET_HOST=127.0.0.1
POCKET_DATA_DIR=/var/lib/pocket-server
POCKET_AUTH_SECRET=${auth_secret}
POCKET_DEPLOY_TOKEN=${deploy_token}
POCKET_ALLOWED_ORIGINS=${POCKET_SITE_ORIGIN}
POCKET_MAX_ROOMS=32
POCKET_MAX_CONNECTIONS=48
ENV
chmod 600 "${file}"
install -m 644 "${repo}/pocket-server/deploy/pocket-server.service" /etc/systemd/system/pocket-server.service
cat > /etc/caddy/Caddyfile <<CADDY
${POCKET_DOMAIN} {
  encode gzip
  reverse_proxy 127.0.0.1:8788
}
CADDY
caddy validate --config /etc/caddy/Caddyfile
if command -v ufw >/dev/null && ufw status | grep -q '^Status: active'; then
  ufw allow 80/tcp
  ufw allow 443/tcp
fi
systemctl daemon-reload
systemctl enable --now pocket-server
systemctl restart pocket-server
systemctl enable --now caddy
systemctl reload caddy
sleep 2
curl --fail --silent --show-error http://127.0.0.1:8788/health
echo
echo "PocketNet core installed. Public URL: https://${POCKET_DOMAIN}"
echo 'Open 80/443 in the Oracle Cloud VCN security list and, if necessary, the VM firewall.'
echo "For GitHub Actions variable POCKET_SERVER_URL use: https://${POCKET_DOMAIN}"
echo "For the GitHub Actions secret POCKET_DEPLOY_TOKEN run: sudo sed -n 's/^POCKET_DEPLOY_TOKEN=//p' /etc/pocket-server.env"
echo "Server logs: sudo journalctl -u pocket-server -f"
