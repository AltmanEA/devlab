FROM mcr.microsoft.com/devcontainers/typescript-node:2-22-bookworm

# Только Python для native модулей
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# AI CLI: Koda и OpenCode ставятся в образ (/usr/local/lib/node_modules),
# поэтому доступны во всех сервисах (dev, admin, setup) независимо от
# подключенных томов и выбранного PROJECT.
# Настройки и credentials пишутся в HOME (~/.kodacli, ~/.config, ~/.local/share),
# который живёт на volume dev-home и переживает пересоздание контейнера.
RUN npm install -g @kodadev/koda-cli@latest opencode-ai

WORKDIR /workspace
RUN chown -R 1000:1000 /workspace
