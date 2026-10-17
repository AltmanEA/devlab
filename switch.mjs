#!/usr/bin/env node
// Переключатель активного проекта DevLab.
//
// Список проектов живёт внутри named volume dev-projects/projects/,
// поэтому получаем его через сервис admin. Выбор -> запись PROJECT в .env ->
// docker compose up -d (compose пересоздаст dev, т.к. изменился subpath volume).
//
// Использование:
//   node switch.mjs                 интерактивный выбор
//   node switch.mjs <имя>           переключить на существующий проект
//   node switch.mjs --new [имя] [url]  создать проект (git clone) и переключить
//   node switch.mjs --status        только показать текущий проект и список

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = join(ROOT, '.env');

const HELP = `Переключатель проекта DevLab

Использование:
  node switch.mjs                    интерактивный выбор проекта
  node switch.mjs <имя>              переключить на существующий проект
  node switch.mjs --new [имя] [url]  создать проект через git clone и переключить
  node switch.mjs --status           показать текущий проект и список
  node switch.mjs --help             эта справка`;

// Запуск docker без вывода на терминал — для служебных команд (ls, ps).
function docker(args) {
  const res = spawnSync('docker', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (res.error) fail(`Не удалось запустить docker: ${res.error.message}`);
  return {
    status: res.status ?? 1,
    stdout: (res.stdout ?? '').toString(),
    stderr: (res.stderr ?? '').toString(),
  };
}

// Запуск docker с выводом в терминал — для команд, которые видит пользователь.
function dockerInherit(args) {
  const res = spawnSync('docker', args, { cwd: ROOT, stdio: 'inherit' });
  if (res.error) fail(`Не удалось запустить docker: ${res.error.message}`);
  return res.status ?? 1;
}

function fail(message) {
  console.error(`Ошибка: ${message}`);
  process.exit(1);
}

// Текущее значение PROJECT из .env (без файла — null).
function readProject() {
  if (!existsSync(ENV_FILE)) return null;
  const match = readFileSync(ENV_FILE, 'utf8').match(/^PROJECT=(.*)$/m);
  return match ? match[1].trim() : null;
}

// Меняет строку PROJECT в .env, остальные строки остаются как были.
function writeProject(name) {
  const content = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';
  const next = /^PROJECT=.*$/m.test(content)
    ? content.replace(/^PROJECT=.*$/m, `PROJECT=${name}`)
    : `${content}${content.endsWith('\n') || content === '' ? '' : '\n'}PROJECT=${name}\n`;
  writeFileSync(ENV_FILE, next);
  console.log(`.env: PROJECT=${name}`);
}

// Имена каталогов проектов из volume. Шум от entrypoint (.ssh-init.sh) отбрасываем.
function listProjects() {
  const res = docker(['compose', 'run', '--rm', 'admin', 'ls', '-1', 'projects']);
  if (res.status !== 0) {
    fail(`не удалось получить список проектов:\n${res.stderr || res.stdout}`);
  }
  return res.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('['));
}

// Имя проекта не должно ломать путь внутри volume.
function validateName(name) {
  if (!/^[\w][\w.-]*$/.test(name)) {
    fail(`некорректное имя проекта "${name}" — допустимы буквы, цифры, "-", "_", "."`);
  }
  return name;
}

// git clone внутрь volume: путь обязательно относительно /projects.
async function createProject(name, url) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    if (!name) name = (await rl.question('Имя нового проекта: ')).trim();
    if (!url) url = (await rl.question('Git URL (ssh или https): ')).trim();
    if (!name || !url) fail('имя проекта и git URL обязательны');
  } finally {
    rl.close();
  }
  validateName(name);

  console.log(`Клонирую ${url} -> projects/${name}`);
  const status = dockerInherit([
    'compose', 'run', '--rm', 'admin',
    'git', 'clone', url, `projects/${name}`,
  ]);
  if (status !== 0) fail(`git clone завершился с кодом ${status}`);
  return name;
}

async function choose(projects, current) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    console.log('Проекты:');
    projects.forEach((name, i) => {
      console.log(`  ${String(i + 1).padStart(2)}) ${name}${name === current ? '   * текущий' : ''}`);
    });
    console.log(`   n) новый проект (git clone)`)
    console.log(`   q) выход\n`);

    const answer = (await rl.question('Выбор: ')).trim().toLowerCase();
    if (answer === 'q' || answer === '') {
      console.log('Отменено.');
      process.exit(0);
    }
    if (answer === 'n') return { name: null, create: true };

    const index = Number(answer);
    if (!Number.isInteger(index) || index < 1 || index > projects.length) {
      fail(`"${answer}" не является допустимым выбором`);
    }
    return { name: projects[index - 1], create: false };
  } finally {
    rl.close();
  }
}

function showStatus(projects, current) {
  console.log(`Текущий проект: ${current ?? '(не задан)'}`);
  console.log('Доступно:');
  for (const name of projects) {
    console.log(`  ${name === current ? '*' : ' '} ${name}`);
  }
}

// Поднимаем контейнер: compose пересоздаст dev с новым subpath volume.
function apply() {
  console.log('\ndocker compose up -d');
  const status = dockerInherit(['compose', 'up', '-d']);
  if (status !== 0) fail(`docker compose up завершился с кодом ${status}`);
  console.log('\nКонтейнер запущен. Подключение из VS Code или:');
  console.log('  docker compose exec dev bash');
}

async function main() {
  const [arg1, arg2, arg3] = process.argv.slice(2);

  if (arg1 === '--help' || arg1 === '-h') {
    console.log(HELP);
    return;
  }

  const current = readProject();
  const projects = listProjects();

  if (arg1 === '--status') {
    showStatus(projects, current);
    return;
  }

  let target;
  if (arg1 === '--new') {
    target = createProject(arg2, arg3);
  } else if (arg1) {
    validateName(arg1);
    if (!projects.includes(arg1)) {
      fail(`проект "${arg1}" не найден. Доступно: ${projects.join(', ') || '(список пуст)'}`);
    }
    target = arg1;
  } else {
    const choice = await choose(projects, current);
    target = choice.create ? await createProject() : choice.name;
  }

  if (target === current) {
    console.log(`Проект "${target}" уже выбран`);
  } else {
    writeProject(target);
  }
  apply();
}

main();
