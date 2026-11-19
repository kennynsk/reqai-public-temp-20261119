# Platform integration profile

Status: **provisional development profile; every value marked TBD must be confirmed by platform owners before production qualification**.

Do not put credentials in this document. Record identifiers, limits and protocol choices; credentials are provisioned through Kubernetes Secrets.

## LLM provider

| Field | Configured value |
|---|---|
| Provider name | ZAI |
| Base URL | `https://api.z.ai/api/coding/paas/v4` |
| Model catalog, priority order | `glm-5.3-flash`, `glm-5.3`, `glm-5.2`, `glm-5-turbo`, `glm-4.7`, `glm-4.7-flash` |
| Models used by one step | selected model plus configured fallback, maximum 3 |
| Requests/tokens per minute | **TBD confirm for every model** |
| Maximum parallel requests | 5 development default, **TBD calibrate** |
| Context/output limits | 128,000 / 8,000 development defaults, **TBD confirm** |
| Provider request id header/field | `x-request-id`, `request-id` or response `id`, **TBD confirm** |
| Idempotency key support | **TBD** |

Provider-wide details:

- Production base URL: `https://api.z.ai/api/coding/paas/v4`, **TBD approve for on-prem egress**
- TLS/CA/mTLS requirements: TBD
- Published `429` headers and retry guidance: TBD
- Content-policy error codes: TBD
- Other documented non-retryable errors: TBD
- Maintenance notification source: TBD

## IAM and NGAM

| Field | Required value |
|---|---|
| Authorization protocol/flow | OIDC Authorization Code + PKCE, **TBD confirm** |
| Issuer | `https://iam.example.invalid`, **TBD** |
| Audience | `reqai`, **TBD** |
| Discovery or JWKS URI | `https://iam.example.invalid/.well-known/jwks.json`, **TBD** |
| User identifier claim | `sub`, **TBD confirm** |
| Roles claim and value format | `roles` string array, **TBD confirm** |
| Tenant claim | `tenant_id`, **TBD confirm** |
| NGAM forwarded identity headers, if any | TBD |
| Service-account flow | TBD |
| Token clock-skew allowance | 60 seconds, **TBD confirm** |
| Logout/end-session endpoint | TBD |

Required role mappings:

- `user`: `reqai-user`, **TBD confirm**
- `tenant-admin`: `reqai-tenant-admin`, **TBD confirm**
- `operator`: `reqai-operator`, **TBD confirm**
- `auditor`: `reqai-auditor`, **TBD confirm**
- `system-admin`: `reqai-system-admin`, **TBD confirm**

## Platform service objectives

Record the contractual availability, RPO and RTO of PostgreSQL, Kafka, Temporal and NGAM to demonstrate that application targets of 99.5%, RPO ≤5 minutes and RTO ≤30 minutes are achievable.
