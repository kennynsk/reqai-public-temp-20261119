# Requirements Integration API

Requirements Integration API — асинхронный фасад над каноническими artifacts, requirements versions и jobs. Базовый адрес локального API — `http://localhost:5178`. Для интеграции обращайтесь к API напрямую.

## Операции создания

- `POST /api/v1/decompositions` принимает `businessContext` или `inputArtifactId` и создаёт job режима `DECOMPOSITION`.
- `POST /api/v1/requirements/versions/{versionId}/research` получает вход и lineage из immutable requirements version и создаёт job режима `REQUIREMENTS_INSIGHTS`.

Generic `POST /api/v1/jobs` допускает только декомпозицию. Исследование требований запускается исключительно через resource-scoped маршрут версии. Каждый вызов создания требует `Idempotency-Key` из 16–128 безопасных символов и возвращает `202 Accepted` с каноническим `jobId`.

```bash
curl -X POST http://localhost:5178/api/v1/decompositions \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: decomposition-example-0001' \
  --data '{"businessContext":"Сократить время обработки клиентских возвратов"}'

curl -X POST http://localhost:5178/api/v1/requirements/versions/REQUIREMENTS_VERSION_UUID/research \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: requirements-research-0001' \
  --data '{}'
```

Статус, результат, содержимое артефакта и отмена доступны через `/api/v1/jobs/{jobId}`. Исторические jobs удалённых режимов остаются сериализуемыми и читаемыми, но retry/reset для них возвращает конфликт.

Inline JSON ограничен 1 MiB. Большой вход сначала загружается через `POST /api/v1/artifacts` с `X-Content-SHA256`, после чего клиент передаёт только `inputArtifactId`. При включённой авторизации tenant и principal берутся из проверенного Bearer JWT; API не принимает `tenantId` от клиента.

Capability discovery `GET /api/v1` публикует только decomposition и requirements-research. Административные operations, workflow reset, health и metrics не являются MCP-инструментами.

Авторитетный контракт: [OpenAPI v1](api/openapi.v1.json). Breaking changes: [legacy-mode-retirement.md](legacy-mode-retirement.md).

## Декомпозиция без фронтенда: полный пример

Нужны работающие API и фоновые обработчики, а также настроенный LLM-провайдер.
Фронтенд не требуется. Пример запускается в Bash с `curl`, `jq` и `uuidgen`.
В локальном режиме с отключённой авторизацией `REQAI_TOKEN` можно не задавать;
при включённой авторизации укажите JWT пользователя с правом запуска задач.

```bash
set -euo pipefail
API_URL="${REQAI_BASE_URL:-http://localhost:5178}"
AUTH=()
if [ -n "${REQAI_TOKEN:-}" ]; then
  AUTH=(-H "Authorization: Bearer $REQAI_TOKEN")
fi

# Проверить доступные модели и версии промптов.
curl --fail-with-body -sS "${AUTH[@]}" "$API_URL/api/v1" | jq .

# Сохраните ключ и используйте его же при повторе этого запроса после сетевого сбоя.
IDEMPOTENCY_KEY="$(uuidgen)"
ACCEPTED=$(curl --fail-with-body -sS "${AUTH[@]}" \
  "$API_URL/api/v1/decompositions" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  --data '{
    "businessContext": "Сотрудник создаёт заявку на командировку. Руководитель согласует её или возвращает на доработку.",
    "model": "glm-5.3-flash",
    "temperature": 0.2,
    "promptVersion": "2.3.0"
  }')
JOB_ID=$(jq -er '.jobId' <<< "$ACCEPTED")
echo "jobId=$JOB_ID"

# Ограниченное ожидание: 40 минут. По таймауту серверная задача не отменяется.
FINISHED=false
for ((attempt=0; attempt<1200; attempt++)); do
  STATUS=$(curl --fail-with-body -sS "${AUTH[@]}" "$API_URL/api/v1/jobs/$JOB_ID")
  case "$(jq -r '.status' <<< "$STATUS")" in
    SUCCEEDED) FINISHED=true; break ;;
    FAILED|CANCELLED) echo "$STATUS" | jq .; exit 1 ;;
  esac
  sleep 2
done
if [ "$FINISHED" != true ]; then
  echo "Истекло время ожидания; проверьте задачу $JOB_ID позже." >&2
  exit 1
fi

# Метаданные: outcome, сведения о вызовах модели и ошибках этапов.
curl --fail-with-body -sS "${AUTH[@]}" \
  "$API_URL/api/v1/jobs/$JOB_ID/result" | jq .

# Структурированный реестр и полный отчёт с теми же разделами, что в вебе.
curl --fail-with-body -sS "${AUTH[@]}" \
  "$API_URL/api/v1/jobs/$JOB_ID/result/content" -o result.json
curl --fail-with-body -sS "${AUTH[@]}" \
  "$API_URL/api/v1/jobs/$JOB_ID/result/content?format=markdown" -o report.md
```

`SUCCEEDED` означает успешное завершение задачи; отдельно проверяйте `outcome`:
`COMPLETE` или `PARTIAL`. Наличие GAP само по себе не означает `PARTIAL`.
`GET .../result` возвращает метаданные, а `GET .../result/content` — сам реестр.
По умолчанию `format=raw` сохраняет исходный Content-Type артефакта.
`format=markdown` возвращает `text/markdown` для реестра `babok-requirements.v1`
или резервного текстового черновика `babok-text-draft.v1`;
для другого результата будет `409 REPORT_FORMAT_UNAVAILABLE`, для неподдерживаемого
формата — `400`. До готовности результата возможен `409`.

Профиль `2.3.0` исполняет оригинальный BABOK-скилл и формирует все 12 разделов
отчёта. Если `promptVersion` не передан, используется настроенная активная версия
(по умолчанию `2.3.0`). Модель должна присутствовать в capabilities данного сервера.
Подробности: [исполнение BABOK-скилла](babok-skill-execution.md).

## Основной документ, baseline и справочные материалы

В запросе нужен ровно один основной вход: `businessContext` либо `inputArtifactId`.
Для файлов сначала загрузите содержимое как артефакт. Например, UTF-8 текст:

```bash
# Использует API_URL и AUTH из примера выше; source.txt — ваш локальный файл.
SHA256=$(shasum -a 256 source.txt | awk '{print $1}')
UPLOAD=$(curl --fail-with-body -sS "${AUTH[@]}" \
  "$API_URL/api/v1/artifacts" \
  -H 'Content-Type: text/plain; charset=utf-8' \
  -H "X-Content-SHA256: $SHA256" \
  --data-binary @source.txt)
INPUT_ARTIFACT_ID=$(jq -er '.artifactId' <<< "$UPLOAD")

jq -n --arg input "$INPUT_ARTIFACT_ID" \
  '{inputArtifactId: $input, model: "glm-5.3-flash", promptVersion: "2.3.0"}' \
  > decomposition-request.json
curl --fail-with-body -sS "${AUTH[@]}" \
  "$API_URL/api/v1/decompositions" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  --data-binary @decomposition-request.json
```

Baseline и справочники загружаются тем же способом. Их `artifactId` передаются
дополнительно как `baselineArtifactId` (один UUID) и `referenceArtifactIds`
(массив максимум из 20 уникальных UUID). Они допустимы с обоими вариантами
основного входа. Идентификаторы должны ссылаться на доступные пользователю артефакты.
Лимит загрузки файла не гарантирует, что весь документ поместится в контекст модели.

Для прогресса доступен SSE `GET /api/v1/jobs/{jobId}/events`; для отмены —
`POST /api/v1/jobs/{jobId}/cancel`. При сетевом повторе создания сохраняйте исходные
тело и `Idempotency-Key`: новый ключ может создать новую задачу и новый LLM-вызов.

## Контекстное обсуждение требования

Обсуждение включается флагом `REQUIREMENT_DISCUSSION_ENABLED=true` (по умолчанию включено
при наличии базы данных). История изолирована по задаче и anchor (`BR-*`, `SR-*`, `FR-*`,
`NFR-*`, `TR-*`, `CON-*` или `GAP-*`). Открытие диалога не вызывает модель:

Отправка сообщения требует `baseVersionId` сохранённой версии. Клиент может передать
`draft.registry` и `draft.decisions`; сервер заново проверяет идентификаторы, лимиты и
состав контекста. Повтор используйте с тем же `Idempotency-Key`:

```bash
VERSION_ID=$(curl --fail-with-body -sS "${AUTH[@]}" "$API_URL/api/v1/jobs/$JOB_ID/requirements/versions" | jq -er '.items[0].versionId')
curl --fail-with-body -sS "${AUTH[@]}" -X POST "$API_URL/api/v1/jobs/$JOB_ID/discussions" \
  -H 'Content-Type: application/json' \
  --data "$(jq -n --arg version "$VERSION_ID" '{anchorId:"GAP-001",baseVersionId:$version}')" | jq .
curl --fail-with-body -sS "${AUTH[@]}" -X POST "$API_URL/api/v1/jobs/$JOB_ID/discussions/GAP-001/messages" \
  -H 'Content-Type: application/json' -H "Idempotency-Key: $(uuidgen)" \
  --data "$(jq -n --arg version "$VERSION_ID" '{message:"Какие данные нужны для проверки ответа?",baseVersionId:$version}')" | jq .
```

Параметры `DISCUSSION_MESSAGE_MAX_CHARS`, `DISCUSSION_CONTEXT_MAX_BYTES`,
`DISCUSSION_OUTPUT_MAX_CHARS`, `DISCUSSION_HISTORY_MESSAGES`, `DISCUSSION_MAX_CHANGES` и
`DISCUSSION_PROMPT_VERSION` ограничивают интерактивный контур. Предложения AI только
описывают изменения существующих требований; их принятие выполняется в интерфейсе и
остаётся несохранённым до обычного создания версии. GAP, источники, связи и ID моделью
не меняются. Для живого статуса попытки можно открыть SSE
`GET /api/v1/jobs/{jobId}/discussions/{anchorId}/events`; после разрыва передайте
последний `Last-Event-ID`, а для полной сверки используйте чтение истории диалога.
