# Issue 78: bounded Issue task model routing

**Goal:** Implement the accepted model selection and one-upgrade lifecycle in Issue #78 and ADR-0067.
**Why planning is required:** This changes public workflow contracts, persisted recovery state, and authorization-sensitive cross-module dispatch.
**Acceptance:** AC-1 through AC-11 of https://github.com/ron03wlb/skills/issues/78 pass at one committed candidate with independent clean Standards and Spec review. Preserve legacy Runs, tasks and receipts, the original ten-wave budget, and uncertain native requests. Stop before installation, integration, closure, push or deployment.

Execution authority is the unchanged Run `workflow-op-v1-b635e391bf82b34dda75f7c6261faa91924d04d6a54deaf966c67f98ab4d69ec`, operation `workflow-op-v1-65f4b586b7fbd2502d67142c759b072f71e7ef560510ab644d4d2189e53e3466`, target `features/ron`, baseline `c425ad87426e314640307e4c3cc0ab08ef1507a7`, and Planning Seal `e355e55c796b059ad047bcedf737deecb041ee38`. The sole lane is `C:/Users/ron.chang/.codex/worktrees/8ea8/skills` on `codex/issue-78-model-routing`, owned by task `01a0804b-2a85-7dc3-84e8-55b50c6df7dd`. The existing pre-implementation blocker remains in history; the coordinator clarified the general discipline skill source without changing authority. Repair waves start at the observed zero.

### Outcome 1: bounded, durable initial selection
- Work: Expose the validated semantic Issue/Spec contract, accept coordinator assessment with exact input identity, enforce model/effort floors, and freeze policy membership and creation settings in the owning Run journal and task intent. Supply explicit native arguments. An explicit model-policy input carries the existing human authorization; old unbound Runs never enroll through runtime observation or re-entry.
- Verify: `node --test tests/ron-workflow/issue-model-policy.test.mjs tests/ron-workflow/codex-workflow-tasks.test.mjs tests/ron-workflow/run-issue-workflow-core.test.mjs`

### Outcome 2: trustworthy recovery and one same-task upgrade
- Work: Preserve uncertain creation and message requests; distinguish native success from transport acknowledgement. Substitute Astra only after confirmed pre-creation model unavailability. Validate two consecutive code-changing, verified and reviewed repair waves, current Git/task ownership, stopped writes and remaining original repair capacity before reserving one upgrade and continuing the same task. Isolate unavailable Issues and dependants while allowing independent work.
- Verify: Focused task, journal, coordinator, core and GitHub source tests, including native uncertainty, rejected evidence, higher-effort preservation and mixed-DAG progress.

### Outcome 3: coherent installed behavior and completion evidence
- Work: Thread explicit routing input through installed composition; synchronize owning skills, evidence references, executor docs/metadata and changed router descriptions in English. Include executable modules in package inventory. Keep the driver as transport. No consumer installation or immutable-package edit.
- Verify: `node --test tests/ron-workflow/*.test.mjs`, `git diff --check`, final baseline-to-candidate inspection and independent Standards/Spec review. There is no configured typecheck command. Manifest checks apply only if a manifest changes.

The plan is a required non-contract workflow artifact sourced from task AGENTS High-risk rules and the general `writing-plans` skill. It neither changes the approved Spec nor supplies additional authority. Preserve the exact lane and append a blocked receipt if an unresolved scope, authority, or verification gate prevents completion.
