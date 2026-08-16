## Purpose

Определяет устойчивую асинхронную обработку декомпозиции и исследования, которая не зависит от соединения браузера и переживает рестарты компонентов.

## ADDED Requirements

### Requirement: Asynchronous job acceptance
Долгие операции декомпозиции и research SHALL приниматься как асинхронные jobs, а API SHALL подтверждать принятие до завершения LLM-обработки.

#### Scenario: Job is accepted
- **WHEN** авторизованный пользователь отправляет валидный запрос на создание job
- **THEN** API возвращает `202 Accepted`, устойчивый `jobId`, статус `QUEUED` или `ACCEPTED` и URL проверки состояния

### Requirement: Durable execution independent of the client
Принятая job SHALL продолжать исполнение после закрытия браузера, потери SSE-соединения или выхода пользователя из системы.

#### Scenario: User closes the browser
- **WHEN** пользователь закрывает frontend после получения `jobId`
- **THEN** backend завершает workflow и сохраняет доступный пользователю результат

### Requirement: Checkpointed recovery
Workflow SHALL сохранять состояние и результаты завершённых этапов так, чтобы после рестарта worker или pod выполнение продолжалось с последнего подтверждённого checkpoint.

#### Scenario: Worker fails during a model call
- **WHEN** worker прекращает работу до сохранения результата activity
- **THEN** activity повторно назначается доступному worker, а уже подтверждённые предыдущие этапы не выполняются заново

### Requirement: Idempotent creation and step completion
Создание job и фиксация результатов этапов SHALL быть идемпотентными в пределах tenant.

#### Scenario: Creation request is repeated
- **WHEN** два запроса содержат одинаковый `tenantId` и `Idempotency-Key`
- **THEN** система возвращает одну и ту же job и не запускает второй workflow

#### Scenario: Step result is delivered twice
- **WHEN** одинаковый результат activity записывается повторно после retry
- **THEN** уникальный ключ шага предотвращает создание двух подтверждённых результатов

### Requirement: Observable job lifecycle
Job SHALL иметь устойчивые состояния `ACCEPTED`, `QUEUED`, `RUNNING`, `RETRY_WAIT`, `SUCCEEDED`, `FAILED`, `CANCEL_REQUESTED` и `CANCELLED`, а терминально успешная job SHALL указывать outcome `COMPLETE` или `PARTIAL`.

#### Scenario: Research completes partially
- **WHEN** хотя бы одна research-категория завершена успешно, остальные исчерпали допустимые попытки и обязательные этапы могут сформировать результат
- **THEN** job получает `SUCCEEDED` с outcome `PARTIAL` и перечислением неуспешных этапов

#### Scenario: No usable output exists
- **WHEN** ни один обязательный результат не был получен
- **THEN** job получает `FAILED`, а причина доступна через status API

### Requirement: Cooperative cancellation
Пользователь SHALL иметь возможность запросить отмену своей job, а workflow SHALL прекращать запуск новых этапов и по возможности отменять активные вызовы.

#### Scenario: Running job is cancelled
- **WHEN** пользователь с правом отмены запрашивает cancellation
- **THEN** job переходит через `CANCEL_REQUESTED` в `CANCELLED`, не начиная новые этапы, а сохранённые данные остаются до retention cleanup

### Requirement: Immutable job input versions
Входные данные запущенной job MUST быть неизменяемыми; повторная обработка изменённых данных SHALL создавать новую job со ссылкой на родительскую.

#### Scenario: User edits requirements after submission
- **WHEN** пользователь сохраняет изменённые требования для повторной обработки
- **THEN** система создаёт новую job с новым snapshot и `parentJobId`, не изменяя исходную job

### Requirement: Persisted requirements revisions
После завершения decomposition система SHALL позволять владельцу сохранить отредактированные бизнес-, функциональные и нефункциональные требования как новый immutable requirements artifact, сохраняя исходный decomposition result без изменений.

#### Scenario: User saves reviewed requirements
- **WHEN** пользователь редактирует, добавляет или удаляет декомпозированные требования и нажимает сохранение
- **THEN** система создаёт новую версию requirements artifact, возвращает её идентификатор и позволяет восстановить эту редакцию после reload

### Requirement: Optional research from reviewed requirements
Research после decomposition MUST запускаться только по явному действию пользователя, MUST использовать выбранную сохранённую версию требований как immutable input и SHALL создавать research job со ссылкой `parentJobId` на исходную decomposition job.

#### Scenario: User starts research after review
- **WHEN** пользователь сохранил проверенную версию требований и выбирает запуск research
- **THEN** система создаёт отдельную research job на основе сохранённого requirements artifact, не изменяя и не повторяя decomposition job

#### Scenario: User does not request research
- **WHEN** пользователь завершает работу после декомпозиции и сохранения требований
- **THEN** система не запускает research workflow и сохранённая версия остаётся доступной как самостоятельный результат

### Requirement: Reviewed research improvements
Результат связанной research job SHALL содержать предложения по улучшению требований, а пользователь SHALL иметь возможность принять или отклонить предложения и сохранить выбранный итог как новую immutable версию требований.

#### Scenario: User applies selected improvements
- **WHEN** пользователь принимает часть предложений research и отклоняет остальные
- **THEN** система сохраняет новую финальную requirements version с выбранными изменениями и связью с research job и её входной версией

### Requirement: Embedded requirements insights research
Связанный research, запущенный из проверенной декомпозиции, MUST использовать dedicated mode `REQUIREMENTS_INSIGHTS`, SHALL сохранять исходный формат AI-Ресерчера с 8–12 инсайтами по категориям `trends`, `patterns`, `risks`, `competitors` и `standards` и MUST отображаться внутри workspace «Бизнес-требования» без автоматического перехода в самостоятельный модуль исследования рынка.

#### Scenario: User starts AI research from reviewed requirements
- **WHEN** пользователь нажимает запуск research в отредактированной декомпозиции
- **THEN** система сохраняет версию требований, создаёт child research job в режиме `REQUIREMENTS_INSIGHTS` и оставляет пользователя в workspace «Бизнес-требования» с понятным состоянием выполнения

#### Scenario: Requirements insights complete
- **WHEN** связанная `REQUIREMENTS_INSIGHTS` job успешно завершается
- **THEN** frontend показывает категорийные карточки с применимостью, источниками, связями `relatedTo` и готовыми `enhancements`, позволяя вернуться к требованиям и применить выбранные улучшения

### Requirement: Restorable original business context
На этапах проверки требований, связанного AI-исследования и финальной версии frontend SHALL позволять просмотреть исходную бизнес-задачу, использованную родительской decomposition job, включая восстановление после прямого открытия child job или перезагрузки страницы.

#### Scenario: User opens linked research from history
- **WHEN** пользователь открывает связанную research job напрямую или возвращается к ней из истории
- **THEN** frontend разрешает `parentJobId`, загружает input artifact исходной decomposition job и показывает раскрываемый блок «Исходная бизнес-задача» без перехода из текущего workflow
