# Prepare and Attest Exact Issue Prerequisites

**Goal:** Expand `pre-execute-issue` into the exact declared-prerequisite lifecycle that produces or reuses one content-bound Prerequisite candidate, preserves human-only Operator SQL execution, records one `APPLIED` or `NO_OP` attestation, and either stops direct use or returns to the same authorized execution lane.
**Why planning is required:** Issue #27 changes a promoted public workflow contract governing manual database execution, tracker authority, Git worktree identity, and cross-skill continuation, so the repository High-risk tier requires a durable plan.
**Acceptance:** GitHub Issue #27 AC-1 through AC-5 pass; the candidate changes only the public prerequisite skill, metadata, human docs, router surfaces, promoted README classification and descriptions, executable contract tests, and this plan; `pre-execute-issue` becomes model-invoked so both direct human entry and the same authorized `execute-issue` lane can reach it; exact declaration, candidate, blob, branch, worktree, ancestry, outcome, and caller identity drift fails closed; the agent never executes SQL, connects to a database, runs recovery or cleanup, retries external failure, integrates, closes, pushes, deploys, or implements downstream Issue #28; focused and full checks pass; Standards and Spec reviews are clean; the final candidate is committed and its Issue worktree is clean before one completion note is appended and read back.

### Outcome 1: Executable lifecycle contract
- Work: Replace the obsolete path-only contract test with AC-bound assertions for exact declared artifact resolution, unique Issue worktree reuse or creation, Prerequisite candidate validation, human-only execution, content-bound v2 attestation, legacy v1 limits, direct stop, active-lane return, drift stops, and prohibited actions.
- Verify: `node --test --test-name-pattern="pre-execute-issue|manual_prerequisite_complete:v2|Prerequisite candidate|Operator SQL" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 2: Minimal fail-closed public skill
- Work: Update `skills/engineering/pre-execute-issue/SKILL.md` to consume the published Issue or active handoff, reconcile only the exact Issue branch and worktree, invoke `prepare-prerequisite-artifact` only when no matching ready candidate exists, present committed Operator SQL without external execution, append or reuse one exact v2 attestation for `APPLIED` or `NO_OP`, and return only to the original authorized lane after fresh identity checks.
- Risks/open questions: Missing, multiple, dirty, mismatched, or ambiguously owned evidence stops without cleanup or tracker repair. Automatic `execute-issue` dispatch and downstream v2 consumption remain owned by Issue #28.
- Verify: `node --test --test-name-pattern="pre-execute-issue|manual_prerequisite_complete:v2|Prerequisite candidate|Operator SQL" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 3: Synchronized promoted surfaces
- Work: Re-sync `agents/openai.yaml`, `docs/engineering/pre-execute-issue.md`, both `ask-matt` surfaces, and promoted README classification and descriptions in English. Remove both user-only invocation guards so direct human entry and an active `execute-issue` handoff comply with `.agents/invocation.md`; preserve existing plugin membership and add no runtime, adapter schema, SQL parser, setup flow, or new dependency.
- Risks/open questions: Automatic dispatch logic remains owned by Issue #28; this Issue only makes the public prerequisite lifecycle legally reachable from that future active lane.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 4: Candidate verification, review, and completion evidence
- Work: Run the full workflow suite, inspect the exact baseline-to-candidate diff, commit coherent changes, obtain independent clean Standards and Spec review with at most ten material repair waves, rerun required final checks, and publish `implementation_complete` only for the unchanged clean reviewed candidate. Declare this plan as the sole `workflowArtifacts` entry required by the repository High-risk tier.
- Verify: `node --test tests/ron-workflow/*.test.mjs`; `git diff --check`
