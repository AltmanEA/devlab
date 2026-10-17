FROM mcr.microsoft.com/devcontainers/typescript-node:2-22-bookworm

# Только Python для native модулей
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
RUN chown -R 1000:1000 /workspace
