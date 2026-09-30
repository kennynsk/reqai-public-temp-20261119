# ReqAI — подготовка и исследование требований

[![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=000)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)

ReqAI превращает бизнес-контекст в проверенные требования. Текущий продукт состоит из одного управляемого workflow поверх асинхронных jobs, immutable artifacts, PostgreSQL, Kafka и Temporal; LLM-ключи доступны workflow workers и API, который выполняет AI-обсуждение требований; event и maintenance workers их не получают.

## Основной workflow «Подготовка требований»

1. «Контекст» — ввод бизнес-задачи или загрузка файла.
2. «Требования» — AI-декомпозиция на бизнес-, функциональные и нефункциональные требования, ручная проверка и сохранение immutable-версии.
3. «AI-исследование» — необязательное исследование сохранённой версии с карточками предложений.
4. «Финальная версия» — применение выбранных улучшений и сохранение результата.

История, постоянные ссылки `/tasks/{jobId}`, SSE-обновления, отмена и Debug работают через канонический job API. Ранее созданные задачи удалённых режимов доступны только для чтения и скачивания сохранившихся артефактов; повторный запуск не поддерживается. Подробности — в [описании workflow](docs/functional-parity.md) и [заметке о breaking change](docs/legacy-mode-retirement.md).

## Быстрый старт

```bash
git clone https://github.com/kennynsk/arai.git
cd arai
npm install
cp server/env.example .env.dev
npm run dev
```

Заполните в `.env.dev` как минимум настройки выбранного LLM-провайдера. Для Z.AI:

```env
LLM_PROVIDER_MODE=zai
ZAI_API_KEY=...
ZAI_BASE_URL=https://api.z.ai/api/coding/paas/v4
ZAI_MODELS=glm-5.3-flash,glm-5.3,glm-5.2,glm-5-turbo,glm-4.7,glm-4.7-flash
LLM_MODEL_PRIORITY=glm-5.3-flash,glm-5.3,glm-5.2
```

Откройте `http://localhost:5177`. `npm run dev` запускает полный enterprise-стек через Docker Compose, а frontend работает через Vite с hot reload. Изменения backend и workers подхватываются Node watch. Фоновый режим: `npm run dev:detached`; остановка: `npm run dev:stop`. Полная инструкция — [docs/local-development.md](docs/local-development.md), каталог переменных — [docs/configuration.md](docs/configuration.md).

## MCP

MCP gateway выключен по умолчанию и запускается отдельным профилем:

```bash
docker compose --profile mcp up --build
```

Endpoint `http://localhost:5180/mcp` предоставляет пять инструментов: декомпозицию, исследование сохранённой версии, чтение статуса, metadata результата и полного содержимого результата. См. [MCP gateway](docs/mcp-requirements-adapter.md).

## Production

```bash
npm run build:prod
npm run start:prod
```

Production использует `.env.prod`; сервер может раздавать собранный frontend из `client/dist`. Machine-readable REST-контракт находится в [OpenAPI v1](docs/api/openapi.v1.json).

Исполнение оригинального BABOK-скилла, формат отчёта и реальная GLM-проверка описаны в [документации](docs/babok-skill-execution.md).
