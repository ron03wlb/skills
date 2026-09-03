# Installed workflow diagnostics

This is a read-only diagnostic contract for the workflow surfaces visible to the current harness and repository. It never authorizes or denies publication, execution, integration, aggregate verification, or push. Every later skill must read its own authority again at its mutation boundary.

Resolve installed paths from the current harness's available-skill inventory or configured skill root. Do not treat a source checkout, a cached summary, or a similarly named file as installation proof. Do not create, copy, link, repair, or promote a missing skill or adapter during diagnostics.

## Required observations

| Seam | Owning source | Read-only proof |
| --- | --- | --- |
| Configured tracker | `docs/agents/issue-tracker.md` plus its configured CLI or local-file convention | The configuration is readable and one non-mutating tracker health/read operation is available. |
| Triage labels | `docs/agents/triage-labels.md` plus the configured tracker's read-only label-list operation, only when `triage` is installed | Read the mapping, list tracker labels without mutation, and verify every configured exact label exists. A missing label is `MISSING`; unreadable tracker evidence is `UNKNOWN`; label creation is outside diagnostics. |
| Public skill surfaces | The current harness's resolved installations of `grill-with-docs`, `to-spec`, `to-tickets`, `verify-target-before-push`, and `push-target` | Each required `SKILL.md` and `agents/openai.yaml` resolves from the same installed release. |
| Operation-scoped producer store | The separately installed coordinator's `scripts/workflow-control-store.mjs` | `to-spec@v2` and `to-tickets@v2` profiles are exported; no transaction or receipt is created. |
| Producer handoff | `to-spec/references/spec-publication-interfaces.md`, `to-tickets/references/decomposition-publication-interfaces.md`, and the installed coordinator's `scripts/run-authority-adapters.mjs` | Producer-owned handoff read-back and the Run-ready adapter surface are present without invoking a producer. |
| Target reader | The installed coordinator's `scripts/run-authority-adapters.mjs` and `scripts/run-workflow.mjs` | Repository-owned target and reconciliation readers are required by composition; no target ref is changed. |
| Shared target writer | The installed coordinator's `scripts/run-store.mjs` | The target-scoped observe/acquire interface is present; diagnostics only observe and never acquire or reclaim it. |
| Run composition | The separately installed `run-issue-workflow` skill and `scripts/run-workflow.mjs` | The personal coordinator remains outside the promoted plugin while exposing one repository-owned composition entrypoint. |

## Result shape

Report one row per seam with its owning source, observed evidence, and state `PRESENT`, `MISSING`, or `UNKNOWN`. For every missing or unknown seam, name the smallest human action at that owner:

- finish the current repository configuration after the user approves the draft;
- reinstall or update the promoted skill set when a promoted surface is absent or mixed-version;
- install or update the separately authorized personal coordinator when its store or adapters are absent;
- repair tracker access or its repository configuration when the configured read cannot complete.

Preserve every repository file, tracker object, transaction, receipt, branch, worktree, writer lease, and remote ref during this diagnostic. Aggregate setup health is advisory context only: it is never cached as authority, never becomes a workflow gate, and never supplies a generic repair or force route.
