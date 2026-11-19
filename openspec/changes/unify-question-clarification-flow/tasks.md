## 1. Зафиксировать границы и исходное поведение

- [x] 1.1 Зафиксировать скриншоты текущего реестра, карточки, редактора и Questions при одинаковых viewport; выписать используемые стили из компонентов и подтвердить существующий compact gate этапа 2.
- [x] 1.2 Подготовить fixtures BR/SR/FR и GAP с несколькими QUESTION, десятью требованиями, TERM evidence, отсутствующей ссылкой, partial clarification и закрытыми решениями; использовать существующий mock API без платной генерации.

## 2. Общая панель и ручной процесс

- [x] 2.1 Добавить управляемый QuestionClarificationPanel и active GAP/origin UI state в BabokRegistryResult; читать данные из общего review provider без нового answer store или серверных изменений.
- [x] 2.2 Выделить переиспользуемое содержательное тело редактора требования с существующими draft keys, supported fields, required validation и локальным apply/cancel; namespace DOM IDs для встроенного потребителя.
- [x] 2.3 Собрать первый экран панели: GAP и QUESTION, статус, ответ, priority/addressee, evidence disclosures; ручной ввод обновляет действующий общий draft.
- [x] 2.4 Перенести полный дедуплицированный checklist в панель, переиспользуя review-metadata helpers; показывать evidence отдельно от подтверждений и объяснять блокирующие ссылки/следующий шаг.
- [x] 2.5 Подключить связанный редактор как один подэкран с возвратом «К вопросу»; сохранить ответ и незавершённые drafts при переходах и закрытии панели.
- [x] 2.6 Подключить текущие incorporation/no-change, resolution, dismissal и reopen mutations; причины вводить в той же панели, сохранить существующие invalidation и partial blockers.

## 3. AI в том же workspace

- [x] 3.1 Выделить содержимое/контроллер DiscussionPanel без изменения API, subscriptions, history и proposal callbacks; сохранить существующую оболочку ordinary requirement discussion.
- [x] 3.2 Встроить GAP-scoped AI подэкран в общую панель с явным «Помочь уточнить с AI», возвратом и сохранением несданного сообщения; opening не генерирует и не сохраняет версию.
- [x] 3.3 Сохранить явный saved-context action, before/after acceptance, complete/partial feedback, атомарное применение guided package и stale rejection; подписать ordinary entry «Обсудить требование с AI».

- [x] 3.4 Сохранять несданное сообщение при быстрой команде и упростить состояния вопроса, чата и применения правок.

## 4. Два входа и ясная карточка

- [x] 4.1 Добавить компактный stage-two вариант RequirementClarifications: актуальные GAP summaries и «Разобрать вопрос»; убрать повтор полного процесса только из editable compact карточки.
- [x] 4.2 Добавить stage-two queue вариант ReviewQuestions с одним summary на GAP, фильтрами, счётчиками, linked count и next step; подключить общий panel entry и сохранить прежние потребители вне scope.
- [x] 4.3 В focused карточке показать полную формулировку и applicable substantive fields, видимый Edit и краткие вопросы; отделить collapsed source/relationships/provenance, оставляя source warnings видимыми.
- [x] 4.4 Сделать BR successIndicator full-width textarea и читаемым полным значением; подтвердить различия BR/SR/FR/NFR/TR/CON без добавления чужих полей.
- [x] 4.5 Отделить «Пересмотреть оценку» от content editor, используя существующие QUALITY_OPTIONS и provider drafts; дать короткие объяснения без автоматического изменения качества или GAP state.

## 5. Возврат, фокус и сохранение

- [x] 5.1 Подключить GAP/QUESTION resolution в navigateRecord и supported hash entries к панели; обработать missing target, task switch и удаление вопроса с действующими dirty guards.
- [x] 5.2 Сохранять origin section/selection/filters/scroll и восстанавливать trigger focus после Close/Escape; реализовать доступный fallback, если строка исчезла из filtered queue.
- [x] 5.3 Реализовать один modal focus owner для question/editor/AI subviews, keyboard navigation и narrow reflow на текущих panel/control styles.
- [x] 5.4 Подключить embedded drafts к существующей глобальной сборке и scoped invalid-field reveal; сохранить edits при save failure/conflict и отличать локальное completion от saved version.

## 6. Проверки поведения и дизайна

- [x] 6.1 Добавить интеграционные проверки обоих входов в один GAP, единого ответа для нескольких QUESTION, дедупликации десяти требований, TERM evidence и blocking missing references.
- [x] 6.2 Проверить manual/no-change/dismiss/reopen, answer invalidation, partial blocker, complete guided atomic acceptance и stale rejection; ordinary AI и quality reassessment не закрывают GAP.
- [x] 6.3 Проверить origin return, исчезновение строки, deep links, task guards, сохранение скрытого valid draft и focused invalid errors, failed/conflicting saves и восстановление saved decisions после reload.
- [x] 6.4 Проверить BR multiline criterion, FR без BR/SR полей, независимость quality/open GAP, полный authoritative export и существующее finalization acknowledgment без нового gate.
- [x] 6.5 Выполнить целевые и весь client test suite, lint/build и relevant existing server review/discussion regressions; исправить выявленные регрессии в пределах изменения.
- [x] 6.6 Пройти browser acceptance на 320/390/768/1024/1440 CSS px: keyboard, один focus owner, длинные тексты, source warnings, без горизонтального overflow; сравнить палитру/типографику/контролы с исходными скриншотами приложения.
- [x] 6.7 Проверить final/read-only/legacy/linked-research и ordinary discussion вне scope; обновить относящуюся UX документацию и перед archive согласовать пересекающиеся presentation clauses действующих OpenSpec deltas без изменения lifecycle contracts.

Приёмка и ограничения: `docs/clarification-flow-acceptance-2026-10-02.md`. Задача 6.6 выполнена для viewport matrix и keyboard. Проверка нативного zoom 200% исключена из обязательной приёмки по решению пользователя 2026-10-02; она не выполнялась. Эквивалентный reflow проверен отдельно.
