# Правила для AI-агента

## Среда разработки

Все проекты запускаются в Docker-контейнере. **Всегда** выполняйте команды через `docker compose`:

```bash
docker compose exec dev bash          # войти в контейнер
docker compose exec dev <cmd>         # выполнить команду в контейнере
```

## Текущий проект

- Имя проекта берётся из `.env` (переменная `PROJECT`)
- Файлы проекта находятся в volume `dev-projects` по пути `projects/<PROJECT>`
- Внутри контейнера рабочий каталог: `/workspace`

**Персистентность:**
- `/workspace` → named volume `dev-projects` (на диске хоста) → переживает пересоздание контейнера
- `~` (`/home/node`) → named volume `dev-home` (на диске хоста) → кэш npm (`~/.npm`),
  vscode-server (`~/.vscode-server`), кэши инструментов (`~/.cache`), настройки (`~/.config`) —
  переживают пересоздание контейнера
- `./git/` на хосте → bind-mount в `/home/git` → git-конфиг и SSH-ключи

## AI CLI в образе

`koda` (Koda CLI) и `opencode` (OpenCode) установлены глобально в образе (`/usr/local/bin`),
поэтому доступны в `dev` и `admin` при любом PROJECT и любых подключенных томах:

```bash
docker compose exec dev koda
docker compose exec dev opencode
```

Их настройки и credentials пишутся в `~` (`~/.kodacli`, `~/.config/koda`, `~/.local/share/opencode`) —
это volume `dev-home`, они переживают пересоздание контейнера.

## AI-провайдеры opencode

В `~/.config/opencode/opencode.jsonc` настроены два провайдера:

- **neuraldeep** (по умолчанию): `https://api.neuraldeep.ru/v1`, модели `qwen3.6-35b-a3b`
  и `qwen3.6-35b-a3b-noreason`. Ключ берётся из переменной `NEURALDEEP_API_KEY`
  (пробрасывается в контейнер из `.env` через docker-compose).
- **ollama** (локально): `http://host.docker.internal:11434/v1` — Ollama на хосте,
  модели `qwen-text`, `qwen-coder`.

Смена модели: `/models` в TUI или `opencode run --model ollama/qwen-coder '...'`.

## Права пользователей

Все сервисы (`dev`, `admin`, `setup`) работают от **uid 1000 (node)**.
Файлы в volume всегда создаются с владельцем `node:node`, поэтому AI-агент
может свободно писать и изменять файлы в `/workspace`.

## Работа с проектами

### Загрузка проекта
Путь указывается **относительно** `/projects` (корень тома в контейнере `admin`):
```bash
docker compose run --rm admin git clone <url> projects/<имя_проекта>
```
⚠️ Не используйте абсолютный путь `/projects/<имя>` — файлы попадут в корень тома,
а не в подпапку, которая монтируется в `/workspace` сервиса `dev`.

То же самое одной командой (имя проекта выводится из URL, HTTPS -> SSH):
```bash
node switch.mjs --new <url>
```

### Переключение проекта
Изменить `PROJECT=...` в `.env`, затем:
```bash
docker compose up -d
```

### Один проект в контейнере
Сервис `dev` видит только подпапку текущего проекта (volume subpath).
Это ограничение намеренное — для безопасности AI-агента.

### Управление проектами
Сервис `admin` (запускается явно) видит все проекты в volume `dev-projects`.
