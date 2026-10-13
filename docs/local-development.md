# Локальный enterprise-контур

`compose.yaml` поднимает PostgreSQL, Kafka в KRaft-режиме, Temporal Server и Web UI, миграции, API, отдельные decomposition/research workers, event и maintenance workers, frontend, Prometheus и Grafana. `compose.dev.yaml` поверх него заменяет production-like процессы на dev-серверы с bind mounts: frontend работает через Vite HMR, backend и workers — через Node watch. Workflow workers по умолчанию используют реальный ZAI provider и получают `ZAI_BASE_URL`, `ZAI_API_KEY` и `ZAI_MODELS` из корневого `.env.dev`; API также получает настройки LLM для контекстных обсуждений требований; event и maintenance роли их не получают.

Для изолированных тестов mock включается явно через override `LLM_PROVIDER_MODE=mock`; основной локальный Compose не использует mock-модели. Каталог ZAI: `glm-5.3-flash,glm-5.3,glm-5.2,glm-5-turbo,glm-4.7,glm-4.7-flash`; приоритет: `glm-5.3-flash,glm-5.3,glm-5.2`. UI показывает весь каталог, а один шаг snapshot-ит не более трёх моделей для bounded fallback.

Локально IAM отключён и используется логический tenant `default-enterprise`. Mock запрещён конфигурационным guard в `NODE_ENV=production`. Все локальные пароли предназначены только для localhost и не должны переноситься на стенды.

## Имена Compose-ресурсов

Основной проект называется `reqai`: контейнеры получают имена `reqai-api-1`,
`reqai-postgres-1`, `reqai-event-worker-1` и т. д. В командах Compose используются
короткие имена сервисов, например `docker compose logs api`. Внутренний адрес API —
`http://api:5178`; alias `reqai-api` сохранён для общего Nginx-конфига.
Изолированный UX-проект сохраняет имя `reqai-ux`.

При переходе со старого проекта `reqai-local` сначала остановите его старой командой
`docker compose -p reqai-local -f compose.yaml -f compose.dev.yaml down` без `-v`.
По умолчанию новый проект использует volumes `reqai_postgres-data` и
`reqai_kafka-data`. Для подключения прежних данных задайте в корневом `.env`:

```dotenv
REQAI_REUSE_VOLUMES=true
REQAI_POSTGRES_VOLUME=reqai-local_postgres-data
REQAI_KAFKA_VOLUME=reqai-local_kafka-data
REQAI_CLIENT_MODULES_VOLUME=reqai-local_client-node-modules
REQAI_SERVER_MODULES_VOLUME=reqai-local_server-node-modules
```

Эти настройки сохраняют прежние данные и зависимости без копирования volumes.
Не удаляйте подключённые volumes при очистке старого проекта.

## Запуск

```bash
npm run dev
```

Это основной локальный entrypoint: он выполняет `docker compose -f compose.yaml -f compose.dev.yaml up --build` в foreground и показывает общие логи. Frontend доступен на `http://localhost:5177`; изменения в `client/` применяются через hot reload. Для фонового режима:

```bash
npm run dev:detached
docker compose -f compose.yaml -f compose.dev.yaml ps -a
```

Остановить dev-стек можно командой `npm run dev:stop`. Прямой `docker compose up --build` запускает базовый static/Nginx-вариант и не является HMR-режимом.

Первый запуск загружает образы и может занять несколько минут. Одноразовые контейнеры `migrate`, `kafka-init` и `temporal-init` должны завершиться с кодом `0`; остальные сервисы должны быть `Up`/`healthy`.

| Компонент | URL/порт |
|---|---|
| Frontend и `/api` proxy | http://localhost:5177 |
| Backend API | http://localhost:5178 |
| Temporal Web UI | http://localhost:8088 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3000 (`admin` / `admin-local`) |
| PostgreSQL | `localhost:5432` |

После создания задачи интерфейс переходит с `/` на постоянный адрес
`http://localhost:8080/tasks/{jobId}`. Этот URL можно открыть в новой вкладке или другом
авторизованном браузере: состояние, результат и сохранённые версии загружаются с сервера,
а не из `localStorage`. Nginx возвращает SPA entry point для прямых запросов `/tasks/*`,
не изменяя обработку `/api/*` и статических ресурсов.
| Kafka | `localhost:9092` |

## Проверка

```bash
REQAI_E2E_MODEL=glm-5.3-flash node scripts/qualification/local-e2e.mjs FULL
REQAI_E2E_MODEL=glm-5.3-flash node scripts/qualification/local-mcp-e2e.mjs
npm run qualify:task-routing
```

Первый прогон проверяет полный прямой REST-сценарий: декомпозицию, сохранение неизменяемой
версии требований и связанное AI-исследование. Второй запускает обе операции через четыре
публичных MCP-инструмента; REST используется только для сохранения версии, поскольку это
доменный ресурс, а не MCP-операция. Оба скрипта завершаются ошибкой, если provider применил
модель, отличную от `REQAI_E2E_MODEL`, или любой этап не завершился успешно. Для проверки
только декомпозиции передайте `DECOMPOSITION` вместо `FULL`.

Последняя команда создаёт одну задачу, открывает её deep link, подключает два независимых
SSE-клиента к тому же `jobId`, сравнивает сохранённое состояние и проверяет trace pagination.
Для прямого запуска против другого адреса задайте `REQAI_BASE_URL`.

Crash-recovery проверка аварийно завершает decomposition worker во время активной задачи и убеждается, что новый экземпляр завершает тот же `jobId`:

```bash
LLM_MOCK_DELAY_MS=10000 docker compose up -d --force-recreate decomposition-worker
node scripts/qualification/local-restart-recovery.mjs
```

После проверки скрипт поднимает worker с обычным значением задержки из Compose.

## Остановка

```bash
docker compose down
```

Команда сохраняет named volumes. `docker compose down -v` дополнительно безвозвратно удаляет локальные данные PostgreSQL, Kafka, Prometheus и Grafana.
