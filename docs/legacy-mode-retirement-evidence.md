# Legacy-mode retirement evidence

Date: 2026-08-25  
Scope: local Docker development database, admission-blocking code present in the branch while the pre-cleanup compatible worker set remained running.

`npm run qualify:legacy-drain` was executed against the local `reqai` schema and returned:

```json
{
  "qualified": true,
  "activeCount": 0,
  "jobs": []
}
```

The evidence contains no connection string or credentials. Production rollout must repeat the same gate independently for every target database/tenant scope; this local result is implementation evidence, not production sign-off.
