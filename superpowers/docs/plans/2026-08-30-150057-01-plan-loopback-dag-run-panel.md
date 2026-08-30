# Loopback DAG Run panel

**Goal:** Implement Issue #16's dependency-free loopback bridge and replaceable panel so one DAG Run can expose its complete status and accept only bounded authenticated controls.
**Why planning is required:** The change introduces a local HTTP authentication boundary and durable Pause, Resume, and Stop mutations over the workflow journal.
**Acceptance:** The bridge binds only `127.0.0.1`, uses one random in-memory token, rejects unauthenticated requests, exposes no Start or generic command surface, and shuts down cleanly; the versioned status projection contains every panel field without persisting the token; control requests use the existing revisioned `planControl` boundary and are idempotent; representative panel states render safely and accessibly; focused and full repository checks plus independent Standards and Spec review are clean. The original checkout remains untouched, and this Issue does not wire the panel into the coordinator, integrate, close, push, deploy, or perform Issue #17 end-to-end composition.

### Outcome 1: Complete disposable status projection

- Work: Extend `dag-run-status:v1` node projection with its latest Codex task reference, dispatch/retry attempt count, remediation count, and close-progress evidence derived only from normalized facts and the existing journal. Keep scheduling and evidence precedence in `run-core.mjs`; never persist the per-run token.
- Risks/open questions: Projection fields must remain deterministic, display-only, and backwards-compatible with coordinator reduction; they must not become Resume authority.
- Verify: `node --test tests/ron-workflow/run-issue-workflow-core.test.mjs`

### Outcome 2: Authenticated loopback control module

- Work: Add a Node standard-library module under `skills/personal/run-issue-workflow/scripts/` that starts on fixed host `127.0.0.1`, chooses an ephemeral port by default, generates a per-instance random token, serves only authenticated panel/status/control routes, bounds control bodies, and exposes clean shutdown. Route PAUSE, RESUME, and STOP through `planControl`; Refresh performs only a current status read.
- Risks/open questions: Missing, wrong, stale, malformed, oversized, out-of-state, or duplicate requests must not append an event. Stop only records cooperative intent; bridge closure and coordinator composition remain owned by the later lifecycle integration.
- Verify: `node --test tests/ron-workflow/run-issue-workflow-panel.test.mjs`

### Outcome 3: Replaceable status-only panel

- Work: Add one static HTML/CSS/JavaScript asset plus a pure renderer module. Render Run identity/state, blocker edges, frontier branches, tasks, close evidence, retry/remediation counts, diagnoses, ownership, and Resume predicates from the status snapshot only. Enable controls from `legalControls`, escape untrusted evidence, keep Refresh read-only, and show bridge-unreachable or stale status without adding scheduling logic.
- Risks/open questions: The token may exist only in the in-memory launch URL and request authorization; generated markup and status/journal files must never contain it.
- Verify: `node --test tests/ron-workflow/run-issue-workflow-panel.test.mjs`

### Outcome 4: Candidate gate

- Work: Commit coherent TDD slices, run syntax, focused, and full Ron workflow checks, inspect the baseline-to-candidate scope, and reach a clean independent Standards and Spec review fixed point with at most ten repair waves.
- Verify: `node --test tests/ron-workflow/*.test.mjs` and `git diff --check ac72f3a07b67e8f79c29ceef031254b11026e0ec...HEAD`
