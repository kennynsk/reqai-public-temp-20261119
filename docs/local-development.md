# Локальный enterprise-контур

`compose.yaml` поднимает PostgreSQL, Kafka в KRaft-режиме, Temporal Server и Web UI, миграции, API, отдельные decomposition/research/synthesis workers, event и maintenance workers, frontend, Prometheus и Grafana. Workflow workers по умолчанию используют реальный ZAI provider и получают `ZAI_BASE_URL`, `ZAI_API_KEY` и `ZAI_MODELS` из корневого `.env.dev`; LLM-секреты не передаются API, event и maintenance ролям.

Для изолированных тестов mock включается явно через override `LLM_PROVIDER_MODE=mock`; основной локальный Compose не использует mock-модели. Каталог ZAI: `glm-5.3,glm-5-turbo,glm-4.7,glm-4.7-flash`. UI показывает весь каталог, а один шаг snapshot-ит не более трёх моделей для bounded fallback.

Локально IAM отключён и используется логический tenant `default-enterprise`. Mock запрещён конфигурационным guard в `NODE_ENV=production`. Все локальные пароли предназначены только для localhost и не должны переноситься на стенды.

## Запуск

```bash
docker compose up --build -d
docker compose ps -a
```

Первый запуск загружает образы и может занять несколько минут. Одноразовые контейнеры `migrate`, `kafka-init` и `temporal-init` должны завершиться с кодом `0`; остальные сервисы должны быть `Up`/`healthy`.

| Компонент | URL/порт |
|---|---|
| Frontend и `/api` proxy | http://localhost:8080 |
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
node scripts/qualification/local-e2e.mjs DECOMPOSITION
node scripts/qualification/local-e2e.mjs RESEARCH
npm run qualify:task-routing
```

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
