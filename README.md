# DevLab

Docker-окружение для разработки TypeScript-проектов.

## Архитектура

```
dev-projects (named volume)
└── projects/
    ├── <project-a>/     ← проект (имя из PROJECT в .env)
    ├── <project-b>/     ← другой проект
    └── ...

dev-home (named volume)
└── /home/node — служебные данные контейнера:
    ├── .npm           ← кэш npm
    ├── .vscode-server ← сервер и расширения VS Code Remote
    ├── .cache         ← кэши инструментов
    └── .config        ← настройки CLI-утилит
```

**Персистентность данных:**
- `/workspace` → named volume `dev-projects` (subpath `projects/<PROJECT>`) → **живёт на диске хоста**, переживает пересоздание контейнера
- `~` (`/home/node`) → named volume `dev-home` → **живёт на диске хоста**, переживает пересоздание контейнера (смена `PROJECT`, пересборка образа)
- `./git/` на хосте → смонтирован в `/home/git` внутри контейнера → **живёт на диске хоста**

## Аутентификация Git

Push и pull настроены через SSH.

### Структура

```
git/
├── .gitconfig.example  ← шаблон (в репозитории)
├── .gitconfig          ← user.name, user.email (НЕ в git, создайте из шаблона)
├── .ssh-init.sh        ← при старте контейнера копирует SSH-ключи в ~/.ssh с правами 700/600
└── .ssh/               ← НЕ в git
    ├── id_ed25519      ← приватный ключ
    ├── id_ed25519.pub  ← публичный ключ (добавьте в хостинг → Настройки → SSH-ключи)
    └── known_hosts     ← отпечатки хостов (gitverse.ru, github.com)
```

`git/.gitconfig` и `git/.ssh/` содержат персональные данные и ключи — они
перечислены в `.gitignore` и не попадают в репозиторий.

### Как это работает

1. При каждом `docker compose up` контейнер запускает `/home/git/.ssh-init.sh`
2. Скрипт копирует ключи из `./git/.ssh/` в `~/.ssh` с правильными правами (SSH отвергает 777 от bind-mount)
3. Remote-адрес проекта переключён на `git@<host>:<user>/<repo>.git`

⚠️ Копирование происходит **только при старте контейнера**. После изменения
`git/.ssh/*` (новый хост, новый ключ) нужен перезапуск:

```bash
docker compose up -d --force-recreate dev admin
```

### HTTPS вместо SSH

Clone по `https://...` требует логин/пароль — SSH-ключи при этом не участвуют.
`switch.mjs` автоматически переписывает https-URL на `git@<host>:<owner>/<repo>.git`
(флаг `--https` отключает переписывание и клонирует по HTTPS с отключёнными
credential-helper'ами).

VS Code Remote-Containers может дописать в `git/.gitconfig` секцию `[credential]`
с helper'ом, указывающим на конкретную сборку `vscode-server`. После обновления
редактора путь становится нерабочим: git ругается на отсутствующий `node` и
требует логин. `.ssh-init.sh` убирает такую секцию при старте контейнера.

### Использование

```bash
docker compose exec dev git push origin HEAD
docker compose exec dev git pull origin HEAD
```

## Сервисы

| Сервис | Для чего | Видит |
|---|---|---|
| `dev` | Работа, тесты, AI-агент | Только текущий проект |
| `admin` | Загрузка/удаление проектов | Все проекты |

Все сервисы работают от **uid 1000 (node)** — файлы в volume всегда с правильными правами.

## Быстрый старт

### 1. Настройка после клонирования

В репозиторий намеренно не попадают файлы с персональными данными и именем
текущего проекта. Создайте их из шаблонов:

```bash
cp .env.example .env                      # затем укажите PROJECT=<имя>
cp git/.gitconfig.example git/.gitconfig  # затем укажите name и email
mkdir -p git/.ssh                         # затем положите сюда свои SSH-ключи
```

Генерация SSH-ключа и добавление его в хостинг:

```bash
ssh-keygen -t ed25519 -f git/.ssh/id_ed25519
# отпечатки хостов (один файл на все хостинги, >> — чтобы не затереть предыдущие)
ssh-keyscan gitverse.ru github.com >> git/.ssh/known_hosts
```

> Не запускайте `ssh-keyscan` из PowerShell с `> known_hosts` — вывод stderr
> попадает в файл и портит его. Сканируйте внутри контейнера
> (`docker compose exec dev bash -c "ssh-keyscan github.com >> /home/git/.ssh/known_hosts"`).

Публичный ключ (`git/.ssh/id_ed25519.pub`) добавьте в настройки аккаунта
на каждом git-хостинге (GitVerse: Настройки → SSH-ключи, GitHub:
Settings → SSH and GPG keys → New SSH key). Один и тот же ключ работает
на обоих хостингах.

Проверка:

```bash
docker compose exec dev ssh -T git@gitverse.ru
docker compose exec dev ssh -T git@github.com
```

### 2. Собрать образ
```bash
docker compose build
```

### 3. Инициализировать том (только первый раз или после `docker compose down --volumes`)
```bash
docker compose run --rm setup
```

### 4. Загрузить проект
Путь указывается **относительно** `/projects` (рабочий каталог сервиса `admin`):
```bash
docker compose run --rm admin git clone <url> projects/<имя>
```
⚠️ Не используйте абсолютный путь `/projects/<имя>` — файлы попадут в корень тома,
а не в подпапку `projects/<имя>`, которая монтируется в `/workspace` сервиса `dev`.

### 5. Выбрать проект
```bash
switch.cmd        # или: node switch.mjs
```
Либо отредактировать `PROJECT=...` в `.env` вручную

### 6. Запустить
```bash
docker compose up -d
```
(если проект выбирался через `switch` — контейнер уже поднят)

### 7. Работать
```bash
docker compose exec dev bash
npm i
npm test
```

## Переключение проектов

Вместо ручной правки `.env` — скрипт `switch.mjs` (Node на хосте не требуется Docker):

```bash
```bash
switch.cmd                    # интерактивный выбор (Windows)
node switch.mjs               # то же самое, кроссплатформенно
node switch.mjs <имя>         # переключить на существующий проект
node switch.mjs --new <url>   # создать проект (git clone) и переключить
node switch.mjs --status      # текущий проект и список доступных
```

Имя нового проекта берётся из URL (`.../owner/repo.git` -> `repo`), спрашивать его
не нужно. HTTPS-URL переписывается на SSH (`git@host:owner/repo.git`) — клонирование
идёт по SSH-ключам, логин не запрашивается. Если каталог с таким именем уже есть,
клонирование пропускается и выполняется только переключение.

```

Скрипт делает три шага: получает список каталогов в `projects/` через сервис `admin`,
заменяет `PROJECT=` в `.env`, выполняет `docker compose up -d` (compose пересоздаст
`dev` с новым subpath volume). Подключение к контейнеру — из VS Code или
`docker compose exec dev bash`.

Ручной способ остаётся в силе:

```bash
# .env
PROJECT=another-project

# Перезапустить
docker compose up -d
```

## Инструменты в образе

- Node.js 22
- TypeScript, Vite, Vitest (глобально)
- Python 3, make, g++ (для native модулей)
