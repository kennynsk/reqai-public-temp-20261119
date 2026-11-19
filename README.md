# ReqAI

ReqAI формирует черновик требований из описания бизнес-задачи. Пользователь проверяет реестр и уточняет открытые вопросы, при необходимости запускает AI-исследование, затем сохраняет и экспортирует финальную версию.

## Быстрый старт

Нужны Node.js 22 и Docker с Compose. Если в корне репозитория ещё нет `.env.dev`, скопируйте шаблон.

```bash
cp server/env.example .env.dev
```

Укажите `ZAI_API_KEY` в `.env.dev` и запустите `npm run dev`. Интерфейс откроется на [localhost:5177](http://localhost:5177). Для остановки используйте `npm run dev:stop`.

## Документация

- [Работа с требованиями](docs/functional-parity.md)
- [Локальная разработка](docs/local-development.md) и [настройки](docs/configuration.md)
- [REST API](docs/api/openapi.v1.json) и [MCP](docs/mcp-requirements-adapter.md)
- [Развёртывание в Kubernetes](deploy/k8s/production/README.md). Docker Compose настроен для локальной разработки.
