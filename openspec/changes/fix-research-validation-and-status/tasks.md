## Implementation and verification

- [x] Diagnose the Flash output rejection and address the recoverable case.
- [x] Correct grouped history and the final-save states with regression coverage.
- [x] Run local tests and repeat the browser journey with the original synthetic brief and live GLM.
- [x] Collect proposal and narrative defects in one research correction and verify both sections on the revised draft.
- [x] Compare five live Flash research runs with the previous five runs on the same reviewed version.

- [x] Supply joint field diagnostics for proposal rationale and confirmation conditions, with regression coverage.
- [x] Verify five new sequential runs on the same saved input with the critic enabled.

- [x] Constrain semantic repair to flagged research cards and cover attempted collateral edits.
- [x] Compare five new Flash runs with the preceding series.

- [x] Request JSON objects for actionable research with ZAI and verify bounded fresh generation after format or semantic exhaustion.

## Verification

- Both historical Flash runs reached contract repair and stopped with `INVALID_REQUIREMENTS_INSIGHTS`. Their diagnostics did not preserve the exact rejected field. The replay on the same saved version captured `$.insights[4].enhancements` in the initial response. It continued to semantic checks after structural repair and eventually finished with `BABOK_SEMANTIC_INVALID`.
- A fresh browser run on the original brief used Flash for decomposition and research with the critic enabled. Decomposition returned 10 requirements. The analyst's manual success criterion and closed question survived reload. Research returned 6 findings and 2 proposals after repairing `$.insights[1].enhancements[0].category` and passing semantic audit. The final registry contained 11 requirements after one acceptance and one rejection. The accepted addition and the manual criterion were verified in DOCX, Markdown and HTML.
- History was checked against the previous complete and partial runs. The partial editor showed the unsaved final status before the first save. After saving, it showed the final save timestamp without the first-save instruction.
- 436 client, 394 server, and 30 MCP tests passed. Two opt-in PostgreSQL tests were skipped. Client lint and build, prompt qualification, the legacy surface check, and strict OpenSpec validation passed.

[New decomposition](http://localhost:5177/tasks/57f0338a-ec8e-4ea9-8536-8b7eccfa781a) · [New research and final version](http://localhost:5177/tasks/3fa8b79a-6c82-4a9f-8e22-2221d93d3648)

### Research audit follow-up

Five sequential runs on reviewed version `6891c231-7009-43b2-b7eb-31e77f198382` used `glm-5.3-flash`, prompt 2.16.0, low reasoning, temperature 0.2, and an enabled critic. The previous batch ended in two semantic rejections. Four new runs reached the critic, and all four passed, including a corrected NON_ATOMIC proposal. One run stopped during output-format repair before semantic review.

| Job | Seconds | Findings | Proposals | Outcome |
| --- | ---: | ---: | ---: | --- |
| b9222f97-daed-4d05-b945-5bc103a03b29 | 140 | 7 | 5 | Complete |
| d5d8cab9-01cf-429b-98aa-588efcc0b5db | 115 | 5 | 2 | Complete |
| a0d14792-ad79-427a-b707-f691b7334419 | 163 | 7 | 6 | Complete after one semantic correction |
| 7383d9d7-7e26-4ef8-8e35-df59e20701c6 | 103 | 0 | 0 | Partial, INVALID_REQUIREMENTS_INSIGHTS |
| bf46336b-67b9-466a-8711-704340b78be6 | 101 | 7 | 4 | Complete |

### Proposal field follow-up

The same reviewed version and settings produced recommendations in four of five sequential runs. All 20 published proposals passed independent review and had a nonempty rationale and string confirmation conditions. Three initial format repairs named noEnhancementReason as the first failing field. All three recovered from format validation. Run 3 exhausted semantic corrections with two NON_ATOMIC findings. Median execution time was 195 seconds.

| Job | Seconds | Proposals | Final audit or recovery |
| --- | ---: | ---: | --- |
| b6445475-d6dd-4bb1-8b79-8187261eb623 | 144 | 5 | PASSED |
| a8982d67-e427-4c32-b151-72eaf2029c5c | 108 | 5 | PASSED |
| 39274b84-3df6-40d3-bfd1-405f782320f3 | 267 | 0 | BABOK_SEMANTIC_INVALID |
| efc984db-a3dc-47fa-8263-6fd8727291a5 | 257 | 5 | PASSED |
| 21875359-0fc9-4a80-b8e5-5b0cc5969bbf | 195 | 5 | PASSED |

### Atomicity follow-up

The historical third run flagged INS-002 and INS-004 in the first correction and INS-002 in the second. The final NON_ATOMIC findings concerned INS-001:0 and INS-003:0. The trace establishes the changed verdicts, but cannot establish whether those proposals were rewritten. The regression test reproduces and prevents an unrelated card replacement from entering the next audit.

The same reviewed version and settings produced 18 independently reviewed proposals in four of five new runs. Three runs encountered NON_ATOMIC and then passed. One run stopped before auditing after two invalid JSON responses. Median execution time was 158 seconds, compared with 195 in the preceding series.

| Job | Seconds | Proposals | Final audit or recovery |
| --- | ---: | ---: | --- |
| 8f0e513b-95a1-45c0-91eb-60814fe3538c | 125 | 0 | INVALID_REQUIREMENTS_INSIGHTS |
| df65c70f-898e-4fc7-9ba8-75d1e175d5b7 | 158 | 6 | PASSED |
| 1442bd5f-5527-4923-be8c-0f792844fb56 | 159 | 4 | PASSED |
| 25356583-cf8e-45b3-ab2b-262042562fc6 | 213 | 5 | PASSED |
| 36c9588c-b91a-443b-888c-5cf6c8e90dcc | 142 | 3 | PASSED |

### Research stability check

Five sequential local runs on the same reviewed version used Flash with the independent critic enabled. All passed and contained 23 proposals overall. Median execution time was 136 seconds. The live runs recovered through ordinary repairs wherever needed. Regression tests exercised fresh generation after repeated malformed JSON and after semantic correction exhaustion, plus rejection of a still-invalid fresh response.

| Job | Seconds | Proposals |
| --- | ---: | ---: |
| 5caf5c71-8940-4db1-b028-1030161a1994 | 116 | 4 |
| 7df427fa-6d41-4221-a9d6-51d5dd96d34e | 112 | 4 |
| 99ff6d25-9761-4cf1-9347-cecac1debf3e | 173 | 3 |
| 2dab0c67-6c10-466d-b4f8-fc8a598aef27 | 259 | 6 |
| d5b7581a-c413-4657-b2c1-b11178f48fe5 | 136 | 6 |
