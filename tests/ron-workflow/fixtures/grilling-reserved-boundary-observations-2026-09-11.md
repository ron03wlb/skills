# Reserved-boundary grilling observations, 2026-09-11

Candidate at verification time: uncommitted direct skill maintenance against `23673b326ab256c6bad1dd8e822496c9ced5643d` on `features/ron`, task `01a08e76-78da-74a3-8fba-ad4949c77095`.

## Independent model rehearsals

Each rehearsal used a fresh subagent context, the candidate skill paths and raw scenario facts. Expected dispositions, tests, ADRs and earlier model outputs were excluded. Rehearsals were read-only simulated responses; synthetic branch and baseline identities were not live repository evidence.

| Agent | Scenario | Observed result |
| --- | --- | --- |
| `routine_design_rehearsal` | Audit list with UTC range query, Java bindings, an existing covering index, and consistent ordering/paging conventions | No human question. Selected half-open bounds, parameterized SQL, newest-first and page size 50; retained verification assumptions, delegated basis and an empty accepted-document list. |
| `reserved_design_rehearsal` | Existing synchronous audit ingestion meets requirements; a queue is a conventional alternative; a lookup independently needs a new index | Correctly reserved the composite index with costs, alternatives and a recommendation. Also asked unnecessarily about retaining synchronous ingestion versus the unneeded queue. |
| `migration_design_rehearsal` | Accepted optional export column preserves consumers; replacing the old column would need a small migration | Recommended the compatible additive design but unnecessarily asked whether to choose the migrating alternative. |
| `additive_export_rehearsal` | Fresh rerun of the optional-column scenario after the repair below | Selected the compatible opt-in design with no human question. Explicitly rejected the unnecessary migration alternative and retained compatibility and timezone verification needs. |
| `small_migration_rehearsal` | Existing export column must change; two consumers and a cache need around 30 minutes of adaptation, with rollback | Asked for the migration decision despite the small cost. Compared coordinated cutover with staged compatibility, recommended one, and distinguished work duration from downtime and design approval from execution authority. |
| `new_architecture_rehearsal` | Accepted requirement needs asynchronous durable audit ingestion; both the conventional queue and an outbox can satisfy it | Asked for the new architecture and transition decision with alternatives, reasons, migration work and recovery assumptions. Did not treat other modules' precedent as approval. |
| `accepted_design_rehearsal` | Existing synchronous architecture remains sufficient; exact composite-index DDL, costs and maintenance window were already approved and unchanged | No human question. Retained the sufficient architecture, reused exact human-confirmed DDL approval and delegated matching bindings; preserved writing and execution boundaries in the handoff. |

The initial surplus questions showed that listing reserved alternatives could reopen an already sufficient design. The direct-resolution rule now retains existing designs that satisfy accepted requirements and asks only when the selected in-scope proposal needs the reserved decision. The additive-export rerun and accepted-design case exercised that repair. These seven rehearsals show bounded response behavior, not guaranteed future model performance or measured real-world latency, token or question-count improvement.

## Candidate content identities

Final candidate SHA-256 values for the three skill instructions:

| Path | SHA-256 |
| --- | --- |
| `skills/productivity/grilling/SKILL.md` | `2c0813ddd37106ba5584a439e6c051731af5a4d336c7bb689816276d1b29af24` |
| `skills/engineering/grill-with-docs/SKILL.md` | `eb82e107e6c4574d7fab778727204689e3ae953934b013e003e84488cc390ba1` |
| `skills/engineering/domain-modeling/SKILL.md` | `8ce35a166b8521caf177fdaea10b8062affae98b7d955902fd59c687f24ebdea` |

The first three rehearsals preceded the direct-resolution repair; their results are not attributed to the final shared-skill hash. The subsequent rehearsals read the final candidate.

## Automated checks and review

- `node --test tests/ron-workflow/grilling-contract.test.mjs tests/ron-workflow/skill-contracts.test.mjs tests/ron-workflow/run-preparation.test.mjs`: 53/53 passed, zero failures or skips, approximately 221 seconds. Git push fixtures used temporary local repositories, not this workspace remote.
- After the final `to-spec` documentation sync, the five relevant packaging, grilling metadata, planning-lane, publication and document-structure checks passed again using a focused `--test-name-pattern` selection.
- Replaced the old prose-matching behavior assertions with ADR supersession-chain checks. Discovery, references, packaging, invocation, lane and prerequisite contracts remain covered; wording matching is not counted as model behavior proof.
- System Python could not run `quick_validate.py` because PyYAML was absent. Running it through `uv run --no-project --with pyyaml` passed `grilling` and `domain-modeling`; it rejected `grill-with-docs` and `ask-matt` solely because its supported-key list excludes the repository-required `disable-model-invocation`.
- A separate real YAML parse validated all four affected skills' names, descriptions, paired invocation policy and metadata short-description length: 4/4 passed. No project dependency or invocation-policy change was made to accommodate the generic validator.
- Reviewed the scoped diff and scanned active skills and docs for the superseded blanket SQL rule; historical ADRs and earlier observation records remain historical evidence. `git diff --check` passed.

## Limits and preservation

No rehearsal verified actual document writing, lane registration, complete handoff identity validation, tracker publication, database execution or end-to-end delivery. Unrun cases in the scenario catalog remain unverified. At verification time, this task had changed skill instructions, documentation and validation artifacts only, created no commit or workspace-remote push, and preserved the pre-existing untracked `superpowers/docs/plans/2026-09-10-180606-01-plan-clean-run-issue-workflow-entries.md`.
