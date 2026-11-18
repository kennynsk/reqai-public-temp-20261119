## Context

Мотивация — в `proposal.md`; поведенческий контракт — в `specs/requirements-clarification-flow/spec.md`. Текущий путь: `App → AsyncJobWorkspace → BabokRegistryResult`. Изменение включается только при существующем `compact` условии редактируемого BABOK-этапа 2.

Действующие владельцы:

| Область | Владелец |
| --- | --- |
| Выбор требования, фильтры, раздел, GAP/record navigation | `BabokRegistryResult` в `client/src/AsyncJobWorkspace.jsx` |
| Общий черновик и сборка незавершённых правок | `client/src/review-state.js`, `ReviewDraftProvider`, `DraftContext` |
| Поля разных типов и варианты качества | `client/src/review-fields.js` |
| Встроенные вопросы | `client/src/RequirementClarifications.jsx` |
| Общий список и полный ручной процесс | `client/src/ReviewQuestions.jsx` через `RegistryAnalysis` |
| Связи, подтверждения и объяснение следующего шага | `client/src/review-metadata.js`, действующая серверная проверка |
| AI history, генерация, предложения и принятие | `DiscussionPanel`, `DiscussionProposal`, callbacks родителя |
| Палитра, шкала отступов и общая геометрия | `client/src/index.css`, действующие классы компонентов |

Основная спецификация guided workflow устарела в части старой трёхколоночной композиции. Уже выполненные, но не архивированные изменения `requirements-list-detail`, `simplify-requirements-review-screen` и `add-requirement-ai-discussion` подтверждены текущим runtime. Их lifecycle и server contracts сохраняются. Новое изменение заменяет только представление встроенного полного GAP-процесса и его дубликата в списке на общий workspace в editable stage 2; оно не возвращает manual completeness review.

Прототип из обсуждения расположен вне репозитория: `/Users/am/.codex/visualizations/2026/10/02/01a0fbba-5c74-7a03-97de-bc6c95e1d87f/requirement-review-prototype.html`. Он демонстрирует иерархию, а не production code, полноценную маршрутизацию или контракт данных. Рабочая основа — вариант «Вопросы в карточке» с краткими видимыми причинами; локальные формы ответа прототипа заменяются согласованной общей панелью. Прототип не является зависимостью сборки или источником палитры.

## Goals / Non-Goals

**Goals:** собрать существующие операции по GAP в один workspace; сохранить единый draft owner; сделать действия и следующий шаг понятными; возвращать пользователя в точный контекст входа; отделить содержательные поля, качество и evidence; сохранить действующий визуальный язык.

**Non-Goals:** переработка backend, модели GAP/QUESTION, версии или API; миграция решений; автоматическое вычисление качества; обязательный AI; новый gate полноты; полный редизайн навигации/шапки; изменение финала, research workspace, read-only или legacy-формата; deployment или merge.

## Decisions

### 1. Общая боковая панель вопроса, два входа

Добавить `QuestionClarificationPanel.jsx`, которым управляет `BabokRegistryResult`. Идентификатор активного GAP и origin — UI state; сам вопрос, ответ, checks и редактируемые записи всегда читаются из действующего review provider. Не копировать данные вопроса в отдельный store и не хранить собственную «сохранённую» версию ответа в панели.

В реестре `RequirementClarifications` получает компактный вариант: краткий GAP summary, ID, актуальное состояние и «Разобрать вопрос». Полный checklist, ответ и closure controls внутри карточки больше не повторяются. Старый вариант сохраняется для поверхностей вне `compact`.

В `ReviewQuestions` добавить queue-вариант этапа 2: существующий фильтр, счётчики, краткое описание, priority/addressee, количество требований, `gapReviewHint`, действие входа. Source и полный анализ доступны из панели. Старое представление остаётся для read-only и иных существующих потребителей.

Выбрана панель по уже используемому образцу `DiscussionPanel`: пользователь сохраняет реестр/очередь за ней и закрытием возвращается к работе. Альтернатива — отдельная вкладка или страница вопроса — добавляет переходы и не даёт такого же возврата. Две независимые формы отклонены из-за повторения операций и контекста.

### 2. Один процесс с подэкранами внутри одной панели

Первый экран панели:

1. GAP ID, недостающее решение и связанные QUESTION тексты; текущий статус.
2. Ручной ответ и явный вход «Помочь уточнить с AI».
3. Затронутые требования: дедуплицированный checklist, текущая формулировка по запросу, «Редактировать <ID>», dispositions и прогресс.
4. Объяснение `gapReviewHint`, доступное действие завершения; dismissal/reopen согласно текущему состоянию.
5. Источник и подробные связи в disclosures.

Answer edits поступают в общий draft по существующей модели ввода. Не добавлять обязательные «Сохранить ответ» и отдельный серверный save между ответом и правками. Смысл локального «Применить к черновику» редактора требований сохраняется; глобальная кнопка продолжает собирать валидные незавершённые drafts.

Переход к связанному требованию открывает его редактор в подэкране панели с явным «К вопросу <GAP ID>». Переиспользовать существующие поля и `useDraftField`; выделить содержательное тело редактора из `BabokRequirementCard` лишь настолько, насколько требуется этому потребителю. Не встраивать полную карточку с новым входом в ту же GAP-панель и не создавать рекурсивную навигацию.

Верхний контекст выбранного вопроса сохраняется при смене подэкрана. Cancel requirement edit отменяет только эту editing session по действующему draft contract; возвращение или закрытие панели само по себе не отменяет изменения.

При «Изменение не требуется» причина вводится внутри workspace. Не создавать второй одновременно активный modal для этого подтверждения.

Альтернатива — уводить в основной реестр на каждую правку — требует дополнительного цикла возврата и скрывает общую задачу. Одновременное раскрытие редакторов всех десяти требований повторяет прежнюю перегруженность; выбран один текущий editor.

### 3. Существующий AI-процесс в подэкране того же workspace

Повторно использовать GAP anchor, `enterpriseApi`, history, bounded generation, unsent message state, `DiscussionProposal` и callbacks принятия из `DiscussionPanel`. Выделить переиспользуемое содержимое/контроллер обсуждения с теми же параметрами и lifecycle; обычная requirement discussion остаётся в прежней оболочке, а question panel использует его без второй modal-оболочки. Извлечение должно быть локальным, без переписывания API, event subscription или server state machine.

AI-вход выбранного вопроса всегда использует GAP ID, даже если панель открыта из BR/FR. Требование имеет отдельное «Обсудить требование с AI» в existing actions menu. Не смешивать их history. Если для discussion требуется сохранённая версия, сохранить действующее объяснение и явную кнопку сохранения контекста; открытие панели не должно автоматически сохранять или генерировать.

В guided package явно показывать existing complete/partial результат и эффект принятия. Обычное принятие правок не означает incorporation или closure; complete guided package продолжает применять answer/edits/checks/closure атомарно после явного принятия. Отклонение, stale bases, неполный контекст и interrupted attempts сохраняют действующие ограничения.

Альтернатива — новую генерацию и state machine для общей панели — необоснованно расширяет изменение. Наложить `DiscussionPanel` поверх новой modal-панели нельзя из-за focus/close ambiguity.

### 4. Одно место подтверждений, существующие правила

Переиспользовать `requirementGaps`, `gapChecklist`, `gapChecklistComplete`, `gapReviewHint`, `gapHasPendingClarification` и `updateReviewMetadata`. Объединить повторяющееся представление проверок в один потребитель панели; mutations остаются в текущем review owner. Не создавать второй closure validator.

Полный checklist всегда относится ко всему GAP; компактная карточка requirement показывает только состояние связанного вопроса. В панели видны оба уровня: один ответ для GAP и disposition каждого требования. Контекстные TERM/CTX остаются evidence; подтверждения требуется только для требований. Решённый, dismissed и legacy-closed GAP имеют разные подписи.

Manual resolution не требует новой дублирующей причины поверх ответа и checks: использовать текущий generated resolution reason. Dismissal и no-change сохраняют требование причины. Не изменять серверные checks и invalidation bases.

### 5. Возврат и ссылки без изменения task routes

При открытии сохранить origin: job ID, раздел, выбранный requirement ID, filters, scroll positions и trigger ref. Подлежащий реестр/очередь не переключается при локальном переходе в editor панели. На close/Escape восстановить доступный trigger и scroll; если GAP исчез из open queue — ближайший доступный row либо её filter/heading control. Не обращаться к размонтированному или чужому task ref.

Расширить `navigateRecord`: GAP и QUESTION разрешаются в общий GAP workspace в compact-режиме. QUESTION сначала разрешается через `gapId`. Поддерживаемые task/hash links остаются читаемыми; без origin базовый раздел — «Вопросы». Missing GAP/QUESTION показывается как recoverable state. Обычные record links и invalid-draft reveal сохраняют свои прежние назначения.

Панель и background не должны создавать дубли DOM IDs (`record-*`, поля редактора): namespaces для embedded views и container-scoped refs/selectors. Domain draft key `${type}:${id}` остаётся единым. При глобальной валидации сначала определить, доступен ли invalid editor в панели; иначе использовать existing registry reveal, сохранив GAP UI context для возврата. Не создавать второй copy draft для решения проблемы focus.

Task switch и удаление текущего вопроса сбрасывают только невалидный UI context, соблюдая existing save/discard/stay guards. Reload не вводит обещание новой серверной persistence UI: сохранённые decisions грузятся как сейчас, session drafts восстанавливаются действующим механизмом, supported hash target восстанавливает panel entry.

Альтернатива — новые маршруты и сохранение origin на сервере — не нужны для этого взаимодействия.

### 6. Содержание, качество и evidence в карточке

В focused BABOK card оставить ID/type, видимое «Редактировать», полную формулировку, applicable substantive fields, компактные вопросы и короткую строку «Оценка формулировки: <existing value> · Пересмотреть оценку». Меню продолжает содержать general AI discussion и delete; одинаковый путь «Редактировать» из menu допустим как совместимость, но основной вход видим.

Разместить `successIndicator`, `role`, NFR category/scope/verificationMethod, TR completionCriterion и CON obligation/scope по действующим `STRUCTURED_FIELDS`/required flags. Evidence disclosure содержит цитату, locator, provenance и detailed related records, без повторения substantive fields. При первоначальном выборе evidence закрыт; warnings о source availability остаются видимыми.

BR `successIndicator` редактируется на всю доступную ширину в textarea. FR имеет только свои поля: не переносить в него «Критерий успеха» BR или «Роль» SR ради заполнения пустоты.

«Пересмотреть оценку» раскрывает existing `QUALITY_OPTIONS` и короткие объяснения. Это локальная презентация того же поля `quality`, не новые статусы или audit schema. Источник initial quality не объявлять ручной проверкой пользователя. Обычная правка содержания не автоматически устанавливает «Готово». Во время content editing не терять незавершённые поля при смене assessment subview; обе операции используют provider drafts.

Краткие GAP titles получать из существующего анализа без AI-вызова и выдуманной причинности. Если `quality` и open GAP не совпадают по смыслу, показывать оба факта, например «Готово» и «Связанные вопросы · 1». При отсутствующей причине сохраняется честное «Причина не указана» с действием пересмотра.

Альтернатива — автоматически выводить quality из числа GAP — меняет semantics и отвергнута.

### 7. Сохранить действующий дизайн буквально

Не копировать CSS, цвета, шрифты или app chrome из прототипа. Не изменять глобальные tokens в `index.css`, Tailwind theme, типографическую шкалу или палитру типов.

Использовать текущие panel/control patterns: `DiscussionPanel` для боковой оболочки, существующие стили requirement card/textarea/buttons, current indigo primary/selection, slate surfaces, amber question state и emerald подтверждения. Отступы и radii выбираются из уже применённых классов владельцев, а не из макета. Responsive question shell повторяет текущую full-width narrow presentation discussion panel. Новые компоненты не вводят глобальные overrides.

Before/after comparison делать на одной задаче и одинаковых viewport/zoom. Допустимы перестановка элементов, новая композиция общей панели, multiline criterion и compact disclosures; смена визуальной идентичности не входит в приёмку.

При открытии вопроса список связанных требований свёрнут до ввода ответа, с возможностью раскрыть его вручную. В AI-чате быстрые команды отправляют отдельный запрос и оставляют набранный ответ в поле. Кнопка сохранения версии появляется при правках черновика.

## Risks / Trade-offs

- Полная панель снова может перегрузиться десятью требованиями → сначала вопрос/ответ, затем компактный checklist; один подробный editor по запросу, source disclosures закрыты.
- Извлечение discussion body может нарушить subscriptions или proposal acceptance → оставить один controller lifecycle и existing callbacks; регрессии guided/ordinary/read-only discussion обязательны.
- Закрытие общей панели воспринимается как save → shared dirty status и явная глобальная запись версии; никаких server mutations на close.
- Return trigger может исчезнуть после closure → проверять доступность origin и использовать queue fallback.
- Embedded editor может создать duplicate IDs или потерять draft → namespaces DOM, единые domain draft keys, container-scoped focus и tests hidden invalid drafts.
- Старые unarchived specs пересекаются с новой presentation → при sync/archive перечислить заменяемые stage-two clauses и сохранить rules принятия, staleness, finalization, source lineage.
- Видимость общего вопроса не является основанием конкретной quality → не подменять quality gap-count; явно обозначать независимые состояния.
- Прототип отличается цветами → визуальная приёмка исключительно против текущего приложения, не против скриншота макета.

## Migration Plan

Frontend-only изменение, без новых зависимостей и миграции данных. После отдельного запуска реализации сначала зафиксировать current UI screenshots и regression fixtures; затем выделить shared question/discussion content, подключить два входа, refactor focused card и возврат/focus. Действующий scope gate ограничивает rollout этапом 2.

Проверить целевые component/integration tests, весь client test suite, lint/build, relevant server review-metadata/discussion regressions и browser acceptance. Платные AI-вызовы для автоматических UI fixtures заменять существующими mock API; реальную генерацию не запускать только ради визуальной проверки.

Перед archive согласовать main/delta пересечения. Откат — вернуть frontend composition к предыдущему варианту; сохранённые registry/decisions/discussion payloads остаются совместимыми. Не делать force reset чужой работы и не менять deployment в рамках этой задачи.
