# ReqAI — подготовка и исследование требований

[![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=000)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)

Enterprise-приложение для декомпозиции, проверки, исследования и сохранения требований. Основной интерфейс работает поверх асинхронных jobs, immutable artifacts, PostgreSQL, Kafka и Temporal; LLM-ключи доступны только workflow workers.

Соответствие функций исходного интерфейса асинхронным enterprise jobs описано в [docs/functional-parity.md](docs/functional-parity.md).

## Что умеет приложение

### Основной workflow «Подготовка требований»

1. «Контекст» — ввод бизнес-задачи или загрузка файла.
2. «Требования» — AI-декомпозиция на бизнес-, функциональные и нефункциональные требования, ручная проверка и сохранение immutable-версии.
3. «AI-исследование» — необязательный отдельный запуск одного requirements-insights workflow для сохранённой версии.
4. «Финальная версия» — применение выбранных улучшений и сохранение результата.

### «Дополнительные инструменты»

Отдельно от основного workflow доступны:

- `Исследование` — базовый анализ требований и исследование по категориям (тренды, конкуренты, практики).
- `Сравнение (модели, температура)` — A/B-сравнение результатов при разных моделях и/или температуре.
- `Агентное сравнение` — сравнение агентного подхода с более прямым промпт-подходом.
- `Агентное исследование` — агент сам выделяет категорию, проводит исследование и формирует итоговые требования.
- `Тестирование промптов` — ручная проверка системного и пользовательского промптов на выбранной модели.

## Быстрый старт

Основной локальный режим — полный enterprise-контур в Docker Compose. Подробности приведены в [инструкции локального запуска](docs/local-development.md).

### 1) Установить зависимости

```bash
git clone https://github.com/kennynsk/arai.git
cd arai
npm install
```

### 2) Настроить env-переменные

Docker Compose читает корневой `.env.dev`. В явном legacy-режиме сервер сам выбирает env-файл по `NODE_ENV`/`APP_ENV`:

- для legacy dev (`npm run dev:legacy`) читается `.env.dev`;
- для production (`npm run start`) читается `.env.prod`;
- если stage-файл не найден, используется фолбэк `.env`.

Поддерживаются оба расположения (можно выбрать одно):

- в корне проекта: `.env.dev` / `.env.prod` / `.env`;
- в `server/`: `server/.env.dev` / `server/.env.prod` / `server/.env`.

Рекомендуемый вариант для вашего проекта: использовать корневые `.env.dev` и `.env.prod`.  
Шаблон значений можно взять из `server/env.example`.

Пример для актуального Docker enterprise-контура:

```env
LLM_PROVIDER_MODE=zai
ZAI_API_KEY=...
ZAI_BASE_URL=https://api.z.ai/api/coding/paas/v4
ZAI_MODELS=glm-5.3,glm-5-turbo,glm-4.7,glm-4.7-flash
LLM_MODEL_PRIORITY=glm-5.3,glm-5-turbo,glm-4.7
```

GigaChat поддерживается отдельным `LLM_PROVIDER_MODE=gigachat`. OpenRouter-переменные относятся только к `npm run dev:legacy` и не настраивают enterprise workers:

```env
# Только legacy standalone
OPENROUTER_API_KEY=...
<redacted>

# Альтернативный enterprise provider
LLM_PROVIDER_MODE=gigachat
GIGACHAT_AUTH_KEY=...
```

### 3) Запуск

#### Dev

Собирает и запускает актуальные frontend, API, workers, PostgreSQL, Kafka и Temporal через Docker Compose:

```bash
npm run dev
```

Откройте фронтенд: `http://localhost:8080`. Команда работает в foreground; `Ctrl+C` останавливает контейнеры. Для фонового запуска используйте `npm run dev:detached`.

Прежний standalone Node/Vite интерфейс доступен только для целевой проверки legacy-функционала:

```bash
npm run dev:legacy
```

Он открывается на `http://localhost:5177` и не является текущим enterprise-интерфейсом.

#### MCP API для внешних AI-клиентов

Gateway выключен по умолчанию и запускается отдельным Docker Compose profile:

```bash
docker compose --profile mcp up --build
```

Streamable HTTP endpoint: `http://localhost:5180/mcp`. Он предоставляет пять асинхронных tools поверх REST API декомпозиции и исследования; подробности — в [документации MCP gateway](docs/mcp-requirements-adapter.md).

#### Production

Использует `.env.prod`:

```bash
npm run start
```

По умолчанию API будет на `http://localhost:5178` (или на `PORT` из env).

Если перед запуском выполнен `npm run build`, сервер также раздаёт собранный фронтенд из `client/dist`.

## Примечания

- Docker frontend проксирует `/api/*` на backend API; внешний вход — `http://localhost:8080`.
- Только перед `npm run dev:legacy` автоматически завершаются "зависшие" standalone-процессы на портах `5177` и `5178` (`scripts/free-dev-ports.mjs`).
- Перед `npm -w server run dev` сервер также пытается освободить свой порт (`server/scripts/free-dev-port.mjs`).
- Если задан `PORT_RETRY_LIMIT`, сервер при занятом `PORT` пробует следующие порты: `PORT+1`, `PORT+2`, ...
- `OPENROUTER_HTTP_REFERER` и `OPENROUTER_X_TITLE` используются только legacy standalone backend.
- Для Z.AI в coding‑сценариях используйте `ZAI_BASE_URL=https://api.z.ai/api/coding/paas/v4` (см. [Quick Start](https://docs.z.ai/guides/overview/quick-start)).
- Актуальный пример всех переменных есть в `server/env.example`.

## Если legacy-интерфейс на `http://localhost:5177` показывает пустой экран

Обычно это означает, что Vite упал на оптимизации зависимостей (например, после `npm install` при запущенном dev).

Сделайте так:

```bash
npm run fix:links
npm run dev:legacy
```
