## Why

Платформа уже выполняет декомпозицию и исследование требований как устойчивые асинхронные jobs, однако внешнему приложению приходится знать внутренний контракт artifacts, технические job types/modes и lineage-поля. Одновременно рабочие промпты остаются статическими строками в JavaScript, поэтому их выпуск, выбор, аудит и воспроизводимость не оформлены как управляемый enterprise-контракт.

## What Changes

- Добавить доменные асинхронные REST-фасады для запуска декомпозиции, исследования сохранённой версии требований и самостоятельного research без обхода существующей job-модели.
- Сохранить декомпозицию и последующее requirements research отдельными доменными операциями: `/api/v1/decompositions` не запускает дополнительную генерацию insights, а исследование сохранённой версии запускается только отдельным nested endpoint.
- Разрешить небольшие входы передавать фасадам непосредственно, сохранив существующий artifact upload для крупных входов; все фасады внутри создают или используют immutable artifact и стандартную job.
- Сохранить единые `jobId`, status/result URLs, SSE, идемпотентность, authorization, tenant isolation, audit, admission control и workflow execution существующей enterprise-платформы.
- Скрыть от внешнего контракта внутренние `parentJobId`, `inputArtifactId` и технические mode names там, где они однозначно выводятся из доменного ресурса и операции.
- Вынести workflow-промпты из JavaScript в неизменяемые версионированные prompt bundles с manifest, шаблонами, переменными и версией ожидаемой схемы результата.
- Фиксировать выбранные prompt bundle/version/hash в configuration snapshot каждой принятой job, чтобы retries, replay и диагностика не меняли инструкции посреди выполнения.
- Добавить безопасный выбор активной версии и опциональное закрепление разрешённой версии вызывающим клиентом, а также contract tests и управляемый rollback на предыдущую выпущенную версию.
- Выделить транспортно-независимые application operations, которыми пользуются REST routes и сможет пользоваться будущий MCP adapter без копирования orchestration, authorization или persistence logic.
- Зафиксировать будущую MCP-модель как асинхронные инструменты запуска, проверки статуса и чтения результата; реализация и публикация MCP server не входят в первую поставку этого change.
- Сделать создание и строгую валидацию связанного follow-up change `add-requirements-mcp-server` обязательным условием завершения реализации и архивации текущего change, чтобы фактическая поставка MCP server оставалась отдельной, но явно отслеживаемой следующей работой.
- Legacy synchronous endpoints не расширяются и остаются на пути отключения, определённом текущим enterprise rollout.
- Сделать корневой `npm run dev` единым локальным входом в актуальный Docker Compose stack; прежний standalone Vite/Node интерфейс оставить только под явно legacy-командой.
- Перед реализацией MCP синхронизировать README, функциональную карту, конфигурационный справочник, prompt-bundle документацию и OpenAPI с фактическими routes, runtime env и текущим guided workflow; добавить автоматические проверки против повторного расхождения.

## Capabilities

### New Capabilities

- `requirements-integration-api`: Доменные enterprise REST-фасады для декомпозиции и research, их асинхронный контракт, безопасность, идемпотентность, lineage и транспортно-независимая граница для будущего MCP adapter.
- `versioned-prompt-execution`: Неизменяемые prompt bundles, выбор и фиксация версии, совместимость со схемой результата, воспроизводимые retries и управляемый выпуск/rollback.

### Modified Capabilities

Отсутствуют. Change добавляет доменные фасады и управление промптами поверх существующих job, artifact, requirements-version и access contracts, не изменяя их канонические идентификаторы и состояние.

## Impact

- Backend API: новые `/api/v1/decompositions`, `/api/v1/research` и `/api/v1/requirements/versions/{versionId}/research` routes, request/response mapping и OpenAPI schemas.
- Application layer: транспортно-независимые команды запуска и чтения, которые делегируют существующим artifact, job и requirements-version services.
- Workflow workers: загрузка prompt bundle по сохранённому snapshot вместо прямого импорта строк из `server/decomposer-prompts.js` и `server/prompts.js`.
- Configuration and artifacts: manifest активных prompt versions, hashes, output schema compatibility и защищённые diagnostic references без публикации полного prompt content в обычном API.
- Security: существующие Bearer JWT, role mapping, tenant context, owner scoping, audit и rate/admission policies применяются к новым фасадам; клиент не задаёт `tenantId`.
- Compatibility: `/api/v1/jobs` остаётся каноническим execution/status/result API, а новые endpoints являются тонкими адаптерами; будущий MCP server будет ещё одним адаптером над теми же application operations.
