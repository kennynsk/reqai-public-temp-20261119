# ReqAI Requirements MCP gateway

MCP gateway — отдельная тонкая обёртка над Requirements Integration API. Он не импортирует backend repositories, не рендерит prompts, не вызывает LLM и не запускает Temporal напрямую. REST остаётся источником job state, результатов, авторизации и tenant isolation.

## Поставка

- SDK: `@modelcontextprotocol/sdk` `1.30.0`.
- Production transport: authenticated Streamable HTTP на `/mcp`.
- Tool schema: `2.2.0` (добавлены загрузка текстовых материалов и отмена задач).
- Gateway выключен по умолчанию; stdio разрешён только локально при явной конфигурации.

## Tools

| Tool | REST operation | Назначение |
| --- | --- | --- |
| `upload_artifact` | `POST /api/v1/artifacts` | Загрузить текстовый материал и получить artifactId |
| `cancel_task` | `POST /api/v1/jobs/{jobId}/cancel` | Запросить отмену задачи |
| `decompose_requirements` | `POST /api/v1/decompositions` | Асинхронная декомпозиция |
| `research_requirements` | `POST /api/v1/requirements/versions/{versionId}/research` | Исследование сохранённой версии |
| `get_task_status` | `GET /api/v1/jobs/{jobId}` | Канонический статус |
| `get_task_result` | `GET /api/v1/jobs/{jobId}/result` | Metadata результата и ссылка на artifact |
| `get_task_result_content` | `GET /api/v1/jobs/{jobId}/result/content?format=markdown` | Полное человекочитаемое содержимое результата |

Start tools требуют `idempotencyKey` из 16–128 безопасных символов и сразу возвращают backend `202` envelope. Polling выполняется через status/result tools, а после `SUCCEEDED` содержимое отчёта читается через `get_task_result_content`. Read DTO допускает mode исторической задачи, но gateway не предоставляет мутацию для её повторного запуска.

Inline-вход ограничен 1 MiB. Для больших входов клиент загружает artifact через REST и передаёт `inputArtifactId`. Содержимое результата доступно только через read-only tool и ограничено `MCP_RESPONSE_LIMIT_BYTES`; неограниченные byte streams MCP не проксирует.

Операции запуска принимают необязательный `reasoning` (`disabled`, `low`, `high`, `max`); по умолчанию используется `disabled`. Для GLM-5.3 и GLM-5.3-Flash backend преобразует его в минимальный поддерживаемый `reasoning_effort=low`, поскольку эти модели не отключают thinking полностью.

Remote endpoint требует `Authorization: Bearer <JWT>`. Gateway проверяет совместимость capabilities и без изменения пересылает caller token; backend остаётся authoritative для ролей, principal и tenant. Readiness использует отдельный least-privilege token. Первая версия требует одинаковый IAM audience (`forward-same-audience`) и fail-closed при иной конфигурации.

Gateway ограничивает Host, body size, concurrency, backend timeout (`MCP_BACKEND_TIMEOUT_MS`) и MCP payload size (`MCP_RESPONSE_LIMIT_BYTES`). Логи не содержат JWT, prompt/requirements text или artifact content. Threat model допускает ограниченную загрузку текста через artifact API и требует, fail-closed auth, строгих schemas и отсутствия локального execution fallback. Deployment по умолчанию имеет `replicas: 0` и `MCP_ENABLED=false`; публикация требует HTTPS ingress, allowlist и IAM canary.

Breaking change и rollback: [legacy-mode-retirement.md](legacy-mode-retirement.md). Release gates: [mcp-qualification.md](mcp-qualification.md).


## Материалы и отмена (schema 2.2.0)

`upload_artifact` принимает `content` (непустой UTF-8 текст до 262144 байт)
и необязательный `contentType`: `text/plain` (по умолчанию), `text/markdown`
или `application/json`. Gateway сохраняет текст без trim/перекодирования,
вычисляет SHA-256 и отправляет байты в REST с токеном вызывающего пользователя.
Ответ содержит `artifactId`, `size`, `sha256`, `contentType`, `createdAt`.
Загрузка синхронна и не запускает LLM. Повтор загрузки может создать новый артефакт;
сохраняйте возвращённый ID. Gateway не повторяет мутации автоматически.

MCP-клиент сам читает файл и передаёт его содержимое. Локальные пути и URL
не поддерживаются; PDF/DOCX нужно предварительно преобразовать в текст.
Для больших материалов используйте REST upload. Лимит HTTP JSON body действует
дополнительно (экранирование текста увеличивает размер запроса).

Пример последовательности вызовов MCP (UUID заменяются ответами предыдущих шагов):

```json
{"name":"upload_artifact","arguments":{"content":"Сотрудник создаёт заявку. Руководитель согласует заявку.","contentType":"text/plain"}}
```

```json
{"name":"decompose_requirements","arguments":{"idempotencyKey":"mcp-example-decompose-0001","inputArtifactId":"UUID_ИЗ_ЗАГРУЗКИ","model":"glm-5.3-flash","promptVersion":"2.3.0"}}
```

Baseline и справочники загружаются тем же инструментом; ID передаются в
`baselineArtifactId` и `referenceArtifactIds`. Затем вызывайте `get_task_status`
с `jobId`; после `SUCCEEDED` — `get_task_result_content` с `format: "markdown"`
или `"raw"`. В отличие от REST, MCP по умолчанию возвращает Markdown, а raw JSON
находится в строковом поле `content` ответа инструмента.

Для остановки вызовите `cancel_task` с `{ "jobId": "UUID_ЗАДАЧИ" }`.
Ответ — канонический статус задачи, а не обещание немедленной остановки.
Проверяйте статус до `CANCELLED`, `SUCCEEDED` или `FAILED`: завершение может
опередить отмену. Уже выполненные LLM-вызовы не отменяются задним числом.
Ошибки доступа, отсутствующая задача и конфликты возвращаются из REST без обхода
авторизации. Инструмент отмены помечен как изменяющий выполняемую работу.
