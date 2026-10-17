#!/usr/bin/env bash
# Копирует SSH-ключи из /home/git/.ssh в /home/node/.ssh
# и выставляет корректные права (SSH отвергает 777 на bind-mount)

set -euo pipefail

SRC="/home/git/.ssh"
DST="/home/node/.ssh"

if [ -d "$SRC" ]; then
  mkdir -p "$DST"
  chmod 700 "$DST"
  for f in "$SRC"/*; do
    [ -f "$f" ] || continue
    cp "$f" "$DST/"
  done
  # приватный ключ — только владелец
  chmod 600 "$DST"/id_* 2>/dev/null || true
  chmod 600 "$DST"/id_*_* 2>/dev/null || true
  chmod 644 "$DST"/*.pub 2>/dev/null || true
  chmod 644 "$DST"/known_hosts 2>/dev/null || true
  echo "[ssh-init] keys copied to $DST"
else
  echo "[ssh-init] $SRC not found, skipping"
fi

exec "$@"
