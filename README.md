# Исследователь бизнес‑требований

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=000)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)

React‑приложение для анализа бизнес‑требований, выделения категорий и последующего исследования рынка.  
Фронтенд: Vite + React + Tailwind + `lucide-react`  
Бэкенд: Node.js + Express (проксирует запросы к LLM‑провайдерам, чтобы не светить ключ в браузере)

Соответствие функций исходного интерфейса асинхронным enterprise jobs описано в [docs/functional-parity.md](docs/functional-parity.md).

## Что умеет приложение

### Модуль 1: Бизнес-требования

- Ввод бизнес-задачи и декомпозиция на:
  - бизнес-требования;
  - функциональные требования;
  - нефункциональные требования.
- Быстрый переход от общей бизнес-цели к структуре требований для дальнейшей проработки.

### Модуль 2: Исследование рынка

Внутри модуля доступны разные форматы работы:

- `Исследование` — базовый анализ требований и исследование по категориям (тренды, конкуренты, практики).
- `Сравнение (модели, температура)` — A/B-сравнение результатов при разных моделях и/или температуре.
- `Агентное сравнение` — сравнение агентного подхода с более прямым промпт-подходом.
- `Агентное исследование` — агент сам выделяет категорию, проводит исследование и формирует итоговые требования.
- `Тестирование промптов` — ручная проверка системного и пользовательского промптов на выбранной модели.

## Быстрый старт

Для запуска полного enterprise-контура без внешних зависимостей используйте [инструкцию Docker Compose](docs/local-development.md).

### 1) Установить зависимости

```bash
git clone https://github.com/kennynsk/arai.git
cd arai
npm install
```

### 2) Настроить env-переменные

Сервер сам выбирает env-файл по `NODE_ENV`/`APP_ENV`:

- для dev (`npm run dev`) читается `.env.dev`;
- для production (`npm run start`) читается `.env.prod`;
- если stage-файл не найден, используется фолбэк `.env`.

Поддерживаются оба расположения (можно выбрать одно):

- в корне проекта: `.env.dev` / `.env.prod` / `.env`;
- в `server/`: `server/.env.dev` / `server/.env.prod` / `server/.env`.

Рекомендуемый вариант для вашего проекта: использовать корневые `.env.dev` и `.env.prod`.  
Шаблон значений можно взять из `server/env.example`.

Пример содержимого:

```env
# Вариант A: OpenRouter
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=...

# Вариант B: Z.AI (например, GLM‑4.7)
ZAI_API_KEY=...
ZAI_BASE_URL=https://api.z.ai/api/paas/v4
OPENROUTER_MODEL=glm-4.7

# Вариант C: GigaChat
GIGACHAT_AUTH_KEY=...
# или пара:
# GIGACHAT_CLIENT_ID=...
# GIGACHAT_CLIENT_SECRET=...

```

### 3) Запуск

#### Dev

Использует `.env.dev`, поднимает одновременно сервер и фронтенд:

```bash
npm run dev
```

Откройте фронтенд: `http://localhost:5177`

#### Production

Использует `.env.prod`:

```bash
npm run start
```

По умолчанию API будет на `http://localhost:5178` (или на `PORT` из env).

Если перед запуском выполнен `npm run build`, сервер также раздаёт собранный фронтенд из `client/dist`.

## Примечания

- Фронтенд проксирует `/api/*` на `http://localhost:5178` через `client/vite.config.js`.
- Перед `npm run dev` автоматически завершаются "зависшие" dev-процессы на портах `5177` и `5178` (`scripts/free-dev-ports.mjs`).
- Перед `npm -w server run dev` сервер также пытается освободить свой порт (`server/scripts/free-dev-port.mjs`).
- Если задан `PORT_RETRY_LIMIT`, сервер при занятом `PORT` пробует следующие порты: `PORT+1`, `PORT+2`, ...
- Для OpenRouter можно (не обязательно) указать `OPENROUTER_HTTP_REFERER` и `OPENROUTER_X_TITLE`.
- Для Z.AI в coding‑сценариях используйте `ZAI_BASE_URL=https://api.z.ai/api/coding/paas/v4` (см. [Quick Start](https://docs.z.ai/guides/overview/quick-start)).
- Актуальный пример всех переменных есть в `server/env.example`.

## Если на `http://localhost:5177` пустой экран

Обычно это означает, что Vite упал на оптимизации зависимостей (например, после `npm install` при запущенном dev).

Сделайте так:

```bash
npm run fix:links
npm run dev
```
