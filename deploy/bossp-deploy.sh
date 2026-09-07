#!/usr/bin/env bash
#
# HomeClock deploy script — from the dev workstation (Windows/Git Bash or any
# POSIX shell) to bossp over Tailscale SSH.
#
# Usage:   ./deploy/bossp-deploy.sh [user@host]
# Default: bossp@100.72.242.105
#
# Steps: package source (without node_modules/builds), upload, install deps,
# build (shared + server), install systemd user unit, restart service,
# verify localhost health. Tailscale Serve config is NOT touched unless the
# entry is missing (see tail of script output).
set -euo pipefail

HOST="${1:-bossp@100.72.242.105}"
REMOTE_DIR="\$HOME/apps/homeclock"
NODE="remote-node" # resolved on the remote host

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Packaging source"
TAR_EXCLUDES=(--exclude=node_modules --exclude=.git --exclude=dist --exclude=dist-tests --exclude=data --exclude=.expo --exclude=ios --exclude=android --exclude=.eas)
tar czf /tmp/homeclock-deploy.tgz "${TAR_EXCLUDES[@]}" .

echo "==> Uploading to $HOST:$REMOTE_DIR"
ssh "$HOST" "mkdir -p $REMOTE_DIR"
ssh "$HOST" "rm -rf $REMOTE_DIR/apps $REMOTE_DIR/packages $REMOTE_DIR/deploy" # clean stale sources, data/ is preserved
cat /tmp/homeclock-deploy.tgz | ssh "$HOST" "tar xzf - -C $REMOTE_DIR"
rm -f /tmp/homeclock-deploy.tgz

echo "==> Installing dependencies and building (remote)"
ssh "$HOST" 'bash -lc "
  set -e
  export NVM_DIR=\$HOME/.nvm
  . \$NVM_DIR/nvm.sh >/dev/null 2>&1
  NODEBIN=\$(dirname \$(nvm which 22))
  cd ~/apps/homeclock
  export PATH=\$NODEBIN:\$PATH
  cd packages/shared && npm install --no-audit --no-fund && cd ../..
  cd apps/server && npm install --no-audit --no-fund && npm run --silent build && cd ../..
  mkdir -p data
  echo \"node: \$(node --version)\"
"'

echo "==> Installing systemd user unit"
ssh "$HOST" 'bash -lc "
  mkdir -p ~/.config/systemd/user
  cp ~/apps/homeclock/deploy/homeclock.service ~/.config/systemd/user/homeclock.service
  systemctl --user daemon-reload
  systemctl --user enable homeclock.service >/dev/null
  systemctl --user restart homeclock.service
"'

echo "==> Waiting for health"
for i in $(seq 1 20); do
  if ssh "$HOST" 'curl -sf -m 2 http://127.0.0.1:8788/health >/dev/null 2>&1'; then
    echo "==> Health OK"
    ssh "$HOST" 'curl -s http://127.0.0.1:8788/health; echo'
    ssh "$HOST" 'systemctl --user --no-pager status homeclock.service | head -5'
    exit 0
  fi
  sleep 1
done

echo "!! Health check failed — recent logs:" >&2
ssh "$HOST" 'journalctl --user -u homeclock.service -n 40 --no-pager' >&2
exit 1
