# Versioned Prompt Bundles

Production-инструкции находятся в `server/prompt-bundles/<bundle>/<version>/`. Release directory после публикации immutable и содержит шаблоны и `manifest.json` с purposes, variables, output contract и SHA-256 каждого файла. Startup и qualification завершаются ошибкой при отсутствии или изменении released content.

| Bundle | Purpose | Product stage | Templates |
| --- | --- | --- | --- |
| `requirements-decomposition` | `DECOMPOSITION` | «Требования» | `decompose.md` |
| `requirements-insights` | `REQUIREMENTS_INSIGHTS` | необязательное «AI-исследование» | `insights.md` |

Активные и retained releases задаются через `PROMPT_DECOMPOSITION_ACTIVE_VERSION` / `PROMPT_DECOMPOSITION_RELEASED_VERSIONS` и `PROMPT_REQUIREMENTS_INSIGHTS_ACTIVE_VERSION` / `PROMPT_REQUIREMENTS_INSIGHTS_RELEASED_VERSIONS`. Active version должна входить в released allowlist; `promptVersion` может выбрать только разрешённый релиз.

BABOK application adapter поставляется отдельным immutable skill bundle в
`server/skill-bundles/babok-requirements-v3/<version>/`. Его release policy
задают `SKILL_BABOK_REQUIREMENTS_ACTIVE_VERSION` и
`SKILL_BABOK_REQUIREMENTS_RELEASED_VERSIONS`; manifest должен выпускать
`babok-requirements.v1`. Worker не читает внешнюю CLI-директорию
`/Users/am/MyAI/treb/babok-requirements-v3-z` во время выполнения.

## Release procedure

1. Создать новый semantic-version directory, не изменяя опубликованный.
2. Сгенерировать/проверить manifest и output contract командой `node server/scripts/generate-prompt-bundles.mjs`.
3. Выполнить `npm --workspace server run prompts:qualify` для API/worker image.
4. Сначала развернуть квалифицированные workers, затем API.
5. Добавить версию в released allowlist и только после canary сделать её active.

## BABOK 2.2.0 canary

В репозитории установлены `requirements-decomposition@2.2.0` и
`requirements-insights@2.0.0`. Для текущего single-user режима они уже являются
default active profile. В многопользовательской среде ту же конфигурацию можно
включать постепенно как canary:

```dotenv
SKILL_BABOK_REQUIREMENTS_ACTIVE_VERSION=1.0.0
SKILL_BABOK_REQUIREMENTS_RELEASED_VERSIONS=1.0.0
PROMPT_DECOMPOSITION_ACTIVE_VERSION=2.2.0
PROMPT_DECOMPOSITION_RELEASED_VERSIONS=1.0.0,2.0.0,2.1.0,2.2.0
PROMPT_REQUIREMENTS_INSIGHTS_ACTIVE_VERSION=2.0.0
PROMPT_REQUIREMENTS_INSIGHTS_RELEASED_VERSIONS=1.0.0,2.0.0
```

Проверяйте именно тот API/worker image, который будет развернут, и сохраняйте
вывод qualification вместе с manifest hashes:

```bash
PROMPT_DECOMPOSITION_ACTIVE_VERSION=2.2.0 \
PROMPT_DECOMPOSITION_RELEASED_VERSIONS=1.0.0,2.0.0,2.1.0,2.2.0 \
PROMPT_REQUIREMENTS_INSIGHTS_ACTIVE_VERSION=2.0.0 \
PROMPT_REQUIREMENTS_INSIGHTS_RELEASED_VERSIONS=1.0.0,2.0.0 \
npm --workspace server run prompts:qualify
```

Canary gate дополнительно фиксирует provider input/output tokens, latency
activities, размер result artifacts, долю invalid outputs, GAP и partial jobs
на малом, multi-chunk и большом материале. Лимит rendered prompt продолжает
контролироваться `PROMPT_MAX_RENDERED_BYTES`; qualification должна включать
большой artifact ниже лимита и fail-closed проверку выше лимита.

Rollback меняет active prompt version обратно на `1.0.0` только для новых
jobs. BABOK reader, skill bundle и renderer остаются установленными, поэтому
уже принятые BABOK jobs продолжают выполняться и отображаться. Уже принятые
jobs используют `promptProfile`, материалы и `babokSkillProfile` из
`configuration_snapshot`. Удалять legacy release или skill bundle можно лишь
после окончания job/retry/retention window.


Релиз исследования 2.15.0 делает пользовательское описание ориентированным на решение: механизм, польза для задачи, компромисс и условия согласования. Режим и ограничения источников показаны в раскрываемом блоке интерфейса; неподтверждённые конкретные утверждения о конкурентах и нормах сохраняют собственные оговорки. Замены должны менять хотя бы одно содержательное поле. Старые релизы и их хеши сохранены.
