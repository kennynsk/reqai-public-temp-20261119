# Versioned Prompt Bundles

Production-инструкции находятся в `server/prompt-bundles/<bundle>/<version>/`. Release directory после публикации immutable и содержит шаблоны и `manifest.json` с purposes, variables, output contract и SHA-256 каждого файла. Startup и qualification завершаются ошибкой при отсутствии или изменении released content.

| Bundle | Purpose | Product stage | Templates |
| --- | --- | --- | --- |
| `requirements-decomposition` | `DECOMPOSITION` | «Требования» | `decompose.md` |
| `requirements-insights` | `REQUIREMENTS_INSIGHTS` | необязательное «AI-исследование» | `insights.md` |

Активные и retained releases задаются через `PROMPT_DECOMPOSITION_ACTIVE_VERSION` / `PROMPT_DECOMPOSITION_RELEASED_VERSIONS` и `PROMPT_REQUIREMENTS_INSIGHTS_ACTIVE_VERSION` / `PROMPT_REQUIREMENTS_INSIGHTS_RELEASED_VERSIONS`. Active version должна входить в released allowlist; `promptVersion` может выбрать только разрешённый релиз.

## Release procedure

1. Создать новый semantic-version directory, не изменяя опубликованный.
2. Сгенерировать/проверить manifest и output contract командой `node server/scripts/generate-prompt-bundles.mjs`.
3. Выполнить `npm --workspace server run prompts:qualify` для API/worker image.
4. Сначала развернуть квалифицированные workers, затем API.
5. Добавить версию в released allowlist и только после canary сделать её active.

Rollback меняет active version только для новых jobs. Уже принятые jobs используют `promptProfile` из `configuration_snapshot`. Удалять retained release можно лишь после окончания job/retry/retention window.
