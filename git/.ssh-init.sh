#!/usr/bin/env bash
# Копирует SSH-ключи из /home/git/.ssh в /home/node/.ssh
# и выставляет корректные права (SSH отвергает 777 на bind-mount)
# Плюс чистит устаревший credential-helper от VS Code в git-конфиге.

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

# VS Code Remote-Containers прописывает в git-конфиг helper с путём к конкретной
# сборке vscode-server. После обновления VS Code путь перестаёт существовать,
# git падает и требует логин/пароль вместо работы по SSH. Убираем такой helper.
GITCONFIG="${GIT_CONFIG_GLOBAL:-$HOME/.gitconfig}"
if [ -f "$GITCONFIG" ] && grep -q 'vscode-server' "$GITCONFIG"; then
  if git config --global --remove-section credential >/dev/null 2>&1; then
    echo "[ssh-init] убран устаревший [credential] helper из $GITCONFIG"
  else
    echo "[ssh-init] НЕ удалось убрать [credential] helper из $GITCONFIG"
  fi
fi

exec "$@"
