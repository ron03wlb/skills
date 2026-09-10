# Delegated design observations, 2026-09-10

Candidate: WIP against `a341ffe856b7c4fe31525c9b37cdbd70d5ee1b99` on `features/ron`, task `01a08900-d76d-78c1-9e56-44bddb8c208d`. No candidate commit or publication was created. The initial worktree was clean.

## Model rehearsals

Each run used a fresh subagent without inherited conversation, the task's inherited model with no override, the relevant current skill files, and the minimal fictional repository evidence. The evaluator received the user request without expected dispositions or another evaluator's output. The task was explicitly read-only, asking for the next response and draft artifact text. The table records observed decisions, not execution results or comparative performance.

| Case | Observed response | Result | Evidence agent |
| --- | --- | --- | --- |
| Reversible rationale, initial | Selected the ordered Map without a question; drafted `architecture/decisions/DEC-018.md` with the supplied custom headings, delegated basis, rationale, and reversal. | Pass | `01a08912-42d3-7980-8365-237342bcbc36` |
| SQL without approval | Presented the exact embedded predicate proposal, asked for SQL approval before editing, and allowed independent helper investigation. | Pass | `01a08912-49fc-7b42-86cf-06db3cbfeb25` |
| SQL with exact approval | Reused unchanged approval without asking again; ordered SQL preparation and verification before Java binding and kept independent label work eligible. No database permission was inferred. | Pass | `01a08912-536b-7e20-bf2a-999da4867734` |
| Ambiguous business intent | Kept cancellation scope proposed and asked what outcome the user intended; conventions did not silently select whole-order or selected-item behavior. | Pass | `01a08912-5c77-7370-be67-a006265cb0d6` |
| Irreversible consequence | Preserved seven-year retention, explained that changing the setting back cannot restore deleted data, and asked whether reopening retention was in scope. | Pass | `01a08912-66ab-7960-9159-64341d925138` |
| Reversible rationale, final | After named-owner loading and ADR-directory clarifications, again chose the ordered Map without confirmation and drafted the existing custom format with honest provenance. | Pass | `01a0891c-b271-7090-bacd-86562230a4c7` |
| Handoff provenance | Drafted the tracker-only Single-Issue Spec without reconfirming delegated `previews.csv` and UTF-8; retained human-confirmed ownership, exclusions, and header-only empty output with mapped acceptance/plan/verification. Publication and lane writes remained unperformed. | Pass | `01a0891c-b621-7962-bcca-547d79fa6b4d` |

These are seven observed rehearsals covering six distinct scenarios, including one rerun after the affected instructions changed. Remaining cases in `grilling-scenarios.md` are specifications, not observed model results. These runs do not verify actual file writing, lane registration, tracker publication, SQL execution, or end-to-end delivery. No latency or token improvement was measured.

Relevant candidate instruction files, SHA-256 of their working-tree bytes:

| File | SHA-256 |
| --- | --- |
| `skills/productivity/grilling/SKILL.md` | `a406332bf2d2770e0c24cd4c0a31e1c0fcd94af93b0290162f436be6c5485b42` |
| `skills/engineering/grill-with-docs/SKILL.md` | `7efca4716dc57ec167cee59610cd7aace743184601a3545c5fea8a18fe51fdf7` |
| `skills/engineering/domain-modeling/SKILL.md` | `2172079bfc5693503f2e9d1f31ca7665153b3cd823c5ab35b1375f745fe47a9c` |
| `skills/engineering/domain-modeling/ADR-FORMAT.md` | `334ca25db05775dfc1d496e7584b51d21a9b883a7f0f6cd1933462b4c78eeab1` |
| `skills/engineering/to-spec/SKILL.md` | `071a8684e3fd477c283841ef048f8dc8576c91813c78e66e90637e92e21f87c8` |

## Automated checks

- Initial three-file test run: 50/52 passed. The failures were the router's 716-word entry against a 700-word limit and a third paragraph in the `to-spec` introduction. The router is now 699 words and the paragraph moved to the relevant middle section.
- After the repairs, the focused discovery/reference and Run preparation tests passed 4/4. The final three-file rerun passed 52/52 with exit 0, zero failures, and zero skips (303288.392 ms). Although its name filter attempted to omit unchanged integration cases, this host executed all 52, including the Git fixture integrations; report the observed coverage rather than assuming the filter skipped them.
- Six skill frontmatters and UI metadata parsed successfully with PyYAML and matched the repository's invocation policy. Validation used the existing offline `uv` cache; no project dependency or global Python installation changed.
- The system `quick_validate.py` passed `grilling` and `domain-modeling`. It rejected the other four solely because its allowed-key list omits the repository-required `disable-model-invocation`; the paired explicit-only policy was preserved. This is a validator compatibility limitation, not a six-skill pass from that validator.
- `git diff --check` passed with repository line-ending normalization. HEAD and the empty index remained unchanged. Existing Codex and agent skill junctions point to this repository; no relinking was required.

Final observed test command:

```powershell
node --test --test-name-pattern '^(?!(Issue closeout is|installed route derives|installed route consumes)).*' tests/ron-workflow/skill-contracts.test.mjs tests/ron-workflow/grilling-contract.test.mjs tests/ron-workflow/run-preparation.test.mjs
```

The ordinary three-file command without the optional filter remains the full-suite reproduction for this scoped contract check. Git pushes shown by the integration fixtures target temporary local repositories, not this workspace's remote.

## Independent review

- Standards reviewer `01a08916-5cc3-7361-81dc-cd2b39c4d3e2` initially identified two confirmed findings: direct cross-skill dependency links conflicted with `.agents/invocation.md`, and artifact-destination branches in prose conflicted with `.agents/writing-docs.md`. Both were repaired with named-owner loading and a short list. Final bounded read-back confirmed zero residual findings and zero advisories, including the selected ADR directory, 699-word router, and two-paragraph introduction repairs.
- Spec reviewer `01a08916-6852-7693-b942-87a0e029a2c5` assessed the frozen accepted conversation requirements and found zero confirmed findings or advisories. Final bounded read-back of the source-loading and presentation repairs remained clean with zero findings and zero advisories; unchanged SQL, provenance, and publication boundaries reused the prior assessment.

The review basis is the user's accepted reversible-decision proposal and explicit SQL exception, with the stated SQL-before-dependent-implementation assumption kept distinct from individual approval of any product SQL change. No tracker Spec was invented for this direct instruction-edit task.
