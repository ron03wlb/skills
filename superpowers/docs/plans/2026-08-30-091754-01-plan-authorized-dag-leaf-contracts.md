# Authorized DAG Leaf Contracts

**Goal:** Let a valid DAG Run Grant invoke the existing shared Issue execution and closeout leaves without weakening their manual authority, evidence, isolation, or delivery boundaries.
**Why planning is required:** This changes a promoted public workflow and invocation-authority contract across skills, docs, metadata, and executable contract tests.
**Acceptance:** Direct human invocation remains valid; coordinator invocation fails closed unless one unchanged read-back DAG Run Grant binds the exact Spec, target, classification, scope, and Multi-Issue decomposition record; the leaf skills never create a Grant or gain push, deploy, scheduling, prerequisite-execution, or scope-expansion authority; `to-tickets` remains a runtime-neutral publication handoff; the Codex-only coordinator remains absent from promoted packaging; all Issue-required focused and full verification passes. Stop on authority ambiguity, Planning Seal drift, public-scope expansion, or unrelated target-work overlap, and preserve the original checkout unchanged.

### Outcome 1: Coordinator-compatible leaf authority
- Work: Update `execute-issue` and `close-issue` so direct human requests and exact valid DAG Run Grants are the only entry authorities, with every existing implementation, evidence, merge, cleanup, tracker, and failure boundary preserved.
- Risks/open questions: Making these leaves model-reachable must not permit implicit authority; missing, stale, or mismatched Grant evidence must stop before mutation.
- Verify: `node --test --test-name-pattern="Issue delivery|Issue closeout|router exposes" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 2: Runtime-neutral decomposition handoff
- Work: Clarify that `to-tickets` publishes and reads back decomposition plus the dependency-ready frontier for either manual consumption or a separately authorized coordinator, without dispatching tasks or depending on a runtime.
- Verify: `node --test --test-name-pattern="to-tickets" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 3: Synchronized public routing and metadata
- Work: Synchronize `ask-matt`, human docs, and `execute-issue`/`close-issue` invocation metadata around the optional authorized coordinator route while keeping `run-issue-workflow` out of promoted READMEs and `.claude-plugin/plugin.json`.
- Verify: `node --test --test-name-pattern="router exposes|changed delivery documentation|promoted skills" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 4: Final candidate proof
- Work: Commit the scoped contract, compare it with baseline `b0dd9e222a850d0a2318c0ca0eb338348dbf9318`, run required focused and full suites, then complete independent Standards and Spec review with bounded repairs.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs tests/ron-workflow/wiki.test.mjs` and `git diff --check`
