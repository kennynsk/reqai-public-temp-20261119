# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev (запускает сервер + фронтенд одновременно, читает .env.dev)
npm run dev

# Production (читает .env.prod)
npm run start

# Сборка фронтенда
npm run build

# Lint (только клиент)
npm -w client run lint

# Починить workspace-симлинки (если npm install выполнялся при запущенном dev)
npm run fix:links
```

Фронтенд: `http://localhost:5177`, сервер API: `http://localhost:5178`.  
Нет тестов — тест-суита в проекте отсутствует.

## Architecture

Проект — **npm workspaces** с двумя пакетами: `client/` и `server/`.

### Server (`server/index.js`)

Express-сервер, который:
1. Принимает запросы от фронтенда на `/api/*`.
2. Определяет провайдера по имени модели в запросе и проксирует вызов к нужному LLM API.
3. В production раздаёт статику собранного фронтенда из `client/dist`.

**Маршрутизация по провайдеру** (в порядке приоритета):
- `GIGACHAT_CORP_MODEL_SET` → GigaChat Corp через `gigachat-js`
- `GIGACHAT_MODEL_SET` → GigaChat REST API напрямую (OAuth через `server/certs/`)
- `ZAI_MODEL_SET` → Z.AI (OpenAI-совместимый)
- остальные → OpenRouter

**Ключевые API-эндпоинты:**
- `GET  /api/models` — список всех доступных моделей из настроенных провайдеров
- `POST /api/decompose` — декомпозиция бизнес-задачи на BT/FT/NFT
- `POST /api/insights` — AI-инсайты по выделенным требованиям
- `POST /api/analyze` — анализ категорий для рыночного исследования
- `POST /api/research` — глубокое исследование по одной категории
- `POST /api/analyze-ab` — A/B сравнение двух моделей/температур на этапе анализа категорий
- `POST /api/agent-*` — агентные версии тех же операций (самостоятельное выделение категории + исследование)
- `POST /api/prompt-test` — ручная проверка промптов

**Промпты** — в двух отдельных файлах:
- `server/decomposer-prompts.js` — промпты Модуля 1: `buildDecomposePrompt`, `buildInsightsPrompt`
- `server/prompts.js` — промпты Модуля 2: `buildAnalyzePrompt`, `buildResearchPrompt`, агентные варианты, `ASK_SYSTEM_PROMPT`

### Client (`client/src/`)

SPA на React 19 + Vite + Tailwind. Два независимых модуля с отдельной логикой:
- `RequirementsDecomposer.jsx` — **Модуль 1: Бизнес-требования**
- `BizReqResearcher.jsx` — **Модуль 2: Исследование рынка**
- `App.jsx` — таб-навигация между модулями

Vite проксирует `/api/*` → `http://localhost:5178`.

---

## Модуль 1 — Бизнес-требования (`RequirementsDecomposer.jsx`)

**Цель:** превратить бизнес-задачу в структурированные требования и обогатить их AI-инсайтами.

**Пайплайн (два шага последовательно):**
1. `POST /api/decompose` — декомпозиция бизнес-задачи на BT / FT / NFT (JSON)
2. `POST /api/insights` — генерация 8–12 инсайтов по 5 категориям: trends, patterns, risks, competitors, standards

**Формат ответа `/api/insights`:**
```json
{
  "insights": [{
    "id": "insight-1",
    "category": "trends|patterns|risks|competitors|standards",
    "title": "...",
    "applicability": 85,
    "relatedTo": ["BT-1", "FT-2"],
    "enhancements": [{ "targetType": "functional", "text": "..." }]
  }]
}
```

**Особенности:**
- Инсайты можно добавить прямо в требования кнопкой «Добавить» — трекинг через `addedKeys` (Set из `id:idx`)
- `id` инсайтов нормализуется на сервере: если модель не вернула — подставляется `insight-{idx+1}`
- Промпты: `buildDecomposePrompt` (max_tokens: 8000), `buildInsightsPrompt` (max_tokens: 6000)

---

## Модуль 2 — Исследование рынка (`BizReqResearcher.jsx`)

**Цель:** песочница для рыночного исследования и экспериментов с моделями. Пять вкладок (`activeTab`):

### `research` — Стандартное исследование
Пайплайн:
1. `POST /api/analyze` — выделяет категории рынка из требований (JSON со списком категорий)
2. `POST /api/research` (kind: `trends` | `competitors` | `practices`) — три последовательных запроса, свободный текст по каждой теме
3. `POST /api/improve-requirements` — улучшение требований на основе выбранных пунктов из исследования
4. `POST /api/ask` — диалог по результатам исследования (с историей)

### `compare` — A/B сравнение
- `POST /api/analyze-ab` — сравнение двух моделей/температур на этапе выделения категорий
- `POST /api/research-ab` — сравнение на этапе исследования

### `agent-compare` — Агентное сравнение двух моделей
Полный агентный пайплайн для каждой модели:
1. `POST /api/agent-analyze` — агентное выделение категорий
2. `POST /api/agent-research` — агентное исследование (max_tokens: 13000)
3. `POST /api/agent-synthesis` — синтез отчёта
4. `POST /api/agent-improve-requirements` — улучшение требований

### `agent-solo` — Агентное исследование (одна модель)
Тот же пайплайн, что `agent-compare`, но для одной модели. Показывает trace выполнения.

### `prompt-test` — Тест промптов
`POST /api/prompt-test` — ручной ввод system + user промпта, сырой ответ модели.

**Ключевое отличие промптов от Модуля 1:**
- Модуль 1 возвращает структурированный JSON привязанный к конкретным требованиям
- Модуль 2 возвращает свободный текст (markdown) про рынок без привязки к BT/FT/NFT

## Environment

Env-файлы ищутся в порядке: `server/.env.{stage}` → `.env.{stage}` → `.env`.  
`NODE_ENV=development` → читает `.env.dev`, `NODE_ENV=production` → `.env.prod`.  
Шаблон всех переменных: `server/env.example`.

Обязательна хотя бы одна из: `OPENROUTER_API_KEY`, `ZAI_API_KEY`, `GIGACHAT_AUTH_KEY` / `GIGACHAT_CLIENT_ID+SECRET`, `GIGACHAT_CORP_CREDENTIALS`.
