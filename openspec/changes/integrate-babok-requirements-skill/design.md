## Context

См. `proposal.md` для мотивации и границ change. Текущая система выполняет
`DECOMPOSITION` как durable workflow: входной artifact валидируется,
разбивается на chunks, каждый chunk отправляется в LLM с одним prompt, после
чего результаты объединяются в JSON. Production prompt выбирается через
immutable prompt profile, а frontend и requirements-version service ожидают
три группы `business / functional / nonfunctional`.

BABOK skill находится вне репозитория приложения и состоит из Markdown-
инструкции, обязательных и условных reference-файлов. LLM provider приложения
получает messages и не умеет самостоятельно читать локальные skill-файлы или
запускать Claude Code/Codex CLI. Поэтому абсолютный путь к skill не может быть
runtime-зависимостью production image.

## Goals / Non-Goals

**Goals:**

- использовать семантику и правила BABOK skill в product decomposition workflow;
- сделать структурированный JSON каноническим результатом приложения;
- сохранить source evidence, provenance, quality, GAP/HYP/TERM и
  traceability при review и последующих immutable versions;
- поддержать optional baseline/reference materials и глобальную консолидацию
  больших входов;
- сохранить совместимость с уже созданными legacy results и prompt releases;
- оставить четыре этапа guided workflow и адаптировать их review surface.
- ограничить длительность и размер каждого model response, сохраняя запас для
  полного BABOK JSON-контракта;
- завершать детерминированные contract violations без скрытых повторов и
  оставлять безопасную диагностическую причину для пользователя.

**Non-Goals:**

- запускать Claude Code, Codex CLI или другой внешний agent runtime из worker;
- реализовывать в первой версии интерактивный цикл «вопрос → ответ →
  автоматический rerun»;
- превращать GAP, HYP, TERM и вопросы в подтверждённые требования или делать
  их редактирование обязательной частью первого релиза;
- переписывать исторические decomposition results и requirements versions;
- одновременно возвращать из LLM независимые Markdown и JSON источники истины.

## Decisions

### 1. Общий skill source и application adapter

Skill будет поставляться в приложение как versioned, repository-local bundle,
содержащий `SKILL.md`, обязательные references и манифест содержимого. Внешняя
директория `/Users/am/MyAI/treb/babok-requirements-v3-z` используется как
исходный материал для синхронизации, но production worker не будет читать этот
абсолютный путь.

`agents/openai.yaml` не включается в server runtime: это metadata для CLI/agent
клиентов. Для приложения создаётся application adapter, который сохраняет
правила классификации и доказательности skill, но задаёт JSON output contract.

Альтернативы:

- запускать внешний CLI — отклонено из-за credentials, sandbox, масштабирования,
  process lifecycle и отсутствия гарантии CLI в container image;
- копировать только текст `SKILL.md` — отклонено, потому что модель не получит
  обязательные определения, quality rules и output template из references;
- читать references из файлов непосредственно во время LLM-вызова — отклонено,
  поскольку provider не имеет file/tool interface.

### 2. JSON как канонический output, Markdown как renderer

Новый bundle будет использовать отдельный output contract
`babok-requirements.v1`. LLM возвращает только JSON. В нём фиксируются:

- `schemaVersion`, `mode`, `summary` и `context`;
- массивы `BR`, `SR`, `FR`, `NFR`, `TR`, `CON`;
- массивы `GAP`, `HYP`, `TERM`, `questions`;
- traceability tree и дополнительные links/delta;
- для requirement records — `id`, `text`, `source`, `origin`, `quality` и
  необязательные связи.

Каждый результат проходит структурную, enum, ID и referential-integrity
валидацию до того, как становится доступен для review. Markdown-отчёт
рендерится детерминированно из валидного JSON для UI/download и не используется
как источник для повторного парсинга.

Альтернативы:

- сохранить Markdown как source of truth — отклонено: таблицы, дерево и ссылки
  сложно безопасно редактировать и валидировать;
- заставить модель выдавать Markdown и JSON одновременно — отклонено: две
  версии одного смысла могут расходиться;
- преобразовывать Markdown вторым LLM-вызовом — оставлено только как временный
  migration spike, но не как основной production path.

### 3. Иерархическая обработка больших материалов

Для небольшого входа допускается единый extraction-вызов. Для большого входа
сохраняется artifact-based chunking, но после extraction добавляется отдельная
global consolidation activity. Она получает ссылки на section artifacts, а не
большие payload через Temporal, и формирует единый `babok-requirements.v1`.

Consolidation отвечает за глобальные IDs, дедупликацию, сопоставление с
baseline, GAP, delta и traceability. Детерминированный validator проверяет
результат после LLM; простой append результатов chunks больше не считается
достаточным.

### 4. Материалы задачи как явно типизированные artifacts

Входная команда сохраняет один обязательный primary source и ноль или больше
optional materials с типом `baseline` или `reference`. Все artifacts проходят
обычную tenant/owner authorization. Отсутствующий baseline не является
ошибкой: отчёт явно сообщает, что сравнение невозможно. Недоступный явно
запрошенный material становится GAP и не используется как подтверждённое
доказательство.

Это позволяет начать с текущего single-text UX и постепенно добавить загрузку
baseline/reference без изменения semantics основного source artifact.

### 5. Две модели version persistence

Result artifact нового schema и requirements version будут хранить полный BABOK
registry. Existing legacy versions продолжат проходить текущую
`business/functional/nonfunctional` normalization. API чтения и UI выбирают
validator/editor по schema marker.

Каждая новая version сохраняет source decomposition job, material lineage,
base version, manual changes и decision metadata. Старые версии не
перезаписываются.

### 6. Review UX: подтверждённые требования отдельно от анализа

Stage 2 сохраняет guided workflow, но вместо трёх колонок получает type-aware
registry с фильтрами/переключателями `BR/SR/FR/NFR/TR/CON`. Подтверждённые
requirements редактируются и сохраняются. `GAP/HYP/TERM`, traceability и
questions показываются в отдельных read-oriented panels; они не добавляются в
requirements автоматически.

Это уменьшает риск, что пользователь примет аналитическую гипотезу за
согласанное требование, и оставляет интерактивную elicitation как отдельное
будущее расширение.

### 7. Research compatibility через target-type registry

Linked research получает immutable BABOK version как input. `relatedTo` и
enhancements валидируются по полному набору BABOK IDs и сохраняют target type
в decision lineage. Legacy research results продолжают использовать старые
BT/FT/NFT identifiers.

### 8. Bounded model execution and contract recovery

Каждый job snapshot должен фиксировать per-model output token budget вместе с
остальными параметрами LLM. Значение по умолчанию для BABOK workflow —
`32 000` output tokens: это запас над обычным JSON-реестром, но не открытый
лимит. Application provider adapter обязан передавать этот budget в запрос
провайдеру, а model attempt trace — сохранять фактическое usage.

Ошибки provider transport/auth/rate-limit могут использовать существующую
bounded retry/fallback policy. Ошибки разбора или валидации уже полученного
ответа (`OUTPUT_CONTRACT_VIOLATION`, invalid JSON, неизвестный enum/ID) не
должны повторять весь Temporal activity автоматически. Для decomposition
допускается ровно один отдельный repair-pass с коротким указанием нарушенного
пути и тем же trusted source context; repair использует отдельный step ID,
также ограничен output budget и после повторного нарушения завершает chunk как
неуспешный.

До repair-pass application adapter может применить только заранее определённые
безопасные defaults, не меняющие требования, evidence или связи. Сейчас это
восстановление пустого `context[].kind` в значение `контекст` с понижением
качества записи до `Требует уточнения`, а также такая же нормализация пустого
или неизвестного `context.quality`, неподтверждённого `context.provenance` в
`Предложено — требует подтверждения` и отсутствующего `context.relatedIds` в
пустой массив. Для всех requirement-связей (`BR.relatedIds`,
`SR/FR/NFR/TR/CON.relatedTo`) и аналитических `GAP/HYP/TERM.affectedIds`
отсутствие подтверждённых связей нормализуется в пустой массив; это не
добавляет фактов или связей. Контекстная запись также может иметь `source: null`,
если прямая цитата отсутствует; source для подтверждённых требований остаётся
обязательным. Пустые строки в nullable-полях (`role`, `scope`, критерии,
метод проверки, `meaning`, `nextStep`) нормализуются в `null`. CON без
подтверждённого `obligation` не принимается как требование: запись удаляется,
а вместо неё добавляется явный GAP о необходимости уточнения. Неполная
traceability link удаляется как неподтверждённая связь. Остальные нарушения
проходят обычный validator и при
необходимости один repair-pass.

Детерминированная ошибка должна попадать в checkpoint/trace с machine-readable
reason code, но raw prompt и raw model output сохраняются только при явно
включённом protected diagnostics режиме. UI получает безопасное сообщение и
ссылку на диагностику, не получая чувствительное содержимое.

Model-attempt persistence должна различать повторные executions одного
workflow step и repair passes и не перезаписывать предыдущую попытку из-за
одинакового provider/model attempt number.

## Risks / Trade-offs

- **[Risk]** Полный skill и references увеличат prompt size и стоимость LLM.
  **Mitigation:** versioned bundle, измерение token usage, bounded reference
  profile и отдельные limits для extraction/consolidation.
- **[Risk]** Semantic deduplication и traceability на этапе consolidation могут
  быть нестабильными. **Mitigation:** строгая schema/ID/link validation,
  golden fixtures, partial-result status и сохранение section evidence.
- **[Risk]** Новый JSON result ломает клиентов, ожидающих три категории.
  **Mitigation:** schema-dispatched readers, legacy rendering, staged prompt
  rollout и сохранение старого bundle на retention window.
- **[Risk]** User-provided materials могут содержать инструкции, пытающиеся
  переопределить skill. **Mitigation:** skill/reference instructions входят в
  trusted bundle, пользовательские artifacts передаются как untrusted data с
  явными границами и проходят обычный access control.
- **[Risk]** Новый registry перегрузит текущий frontend.
  **Mitigation:** progressive disclosure, type filters, отдельные analysis
  panels и read-only analysis в первой версии.
- **[Risk]** Research prompt может потерять смысл новых типов требований.
  **Mitigation:** отдельный target-type contract и fixtures для связей с
  `BR/SR/FR/NFR/TR/CON`; не делать silent projection без явного lineage.
- **[Risk]** Большой output budget может увеличить latency и стоимость.
  **Mitigation:** provider-level `max_tokens`, один bounded repair-pass,
  non-retryable contract failures и измерение output usage по step.
- **[Risk]** Неправильный JSON может быть восстановлен слишком агрессивно.
  **Mitigation:** repair не изменяет source evidence и не нормализует
  неподтверждённые значения молча; после одного неуспешного repair-pass job
  завершается с явным reason code.

## Migration Plan

1. Синхронизировать и проверить repository-local skill bundle, зарегистрировать
   `babok-requirements.v1` и добавить golden fixtures без изменения active
   legacy release.
2. Выпустить workers и API, способные читать legacy и BABOK profiles, затем
   прогнать prompt qualification и contract tests.
3. Включить новый bundle только для новых decomposition jobs через release
   policy/feature flag; уже принятые jobs используют свой snapshot.
4. Включить schema-aware frontend и version persistence; проверить reload,
   partial result, baseline, remote version и linked research сценарии.
5. Провести qualification/canary и измерить качество, latency, token usage,
   размер artifacts, repair rate и долю invalid outputs без скрытых retries.
6. При rollback вернуть active profile на legacy; BABOK jobs продолжат
   обслуживаться поддерживающим schema-aware runtime.
7. Удалять legacy prompt и reader только после окончания job, retry и retention
   window.

## Open Questions

- Нужен ли отдельный download в Markdown в первой версии или достаточно
  JSON-artifact и HTML/рендеринга в интерфейсе?
- Какие русские пользовательские названия выбрать для `SR`, `TR`, `CON` и
  `HYP`, если они отличаются от технических кодов?
- Какой bounded reference profile даст приемлемый баланс качества и token
  usage после первых qualification-прогонов?
