# Issue #50 portable blocker representation

**Goal:** Deliver GitHub Issue #50 only through its Codex-native Single-Issue Run, preserving the approved `to-spec` authority and exact tracker scope.

**Why planning is required:** This is an external-state workflow that may create a Run Grant, start a dedicated Issue task, integrate a candidate, and close a Tracker Issue.

**Acceptance:** The live Issue, Planning Seal, approved scope, current `to-spec` publication/handoff, target state, and stored Run identity reduce to `READY` before any workflow mutation. One dedicated #50 lane may implement only the approved scope; its candidate is integrated and the Issue is closed only through the relevant leaf contracts. The Run ends with an evidence-backed terminal or diagnosed state, without push, deployment, external prerequisite execution, scope expansion, or changes to pre-existing untracked files.

### Outcome 1: Bind and authorize the exact Run
- Work: Read GitHub Issue #50 and repository-owned checkpoint, handoff, journal, target, worktree, completion, and writer evidence; bind the immutable Single-Issue identity only if the Run-ready reduction is `READY`.
- Risks/open questions: Missing, stale, or contradictory upstream publication/handoff must fail closed; no cleanup, Grant, task, or tracker mutation is legal until then.
- Verify: `gh issue view 50 --repo ron03wlb/skills --comments --json number,title,body,state,labels,comments,url`

### Outcome 2: Execute the authorized Issue lane
- Work: Create or adopt exactly one dedicated #50 task/worktree through `execute-issue`; retain the approved blocker-representation scope and run its focused and repository-required checks.
- Risks/open questions: The lane may not push, broaden scope, resolve unrelated working-tree state, or treat implementation completion as close authority.
- Verify: The `execute-issue` leaf records an evidence-bound `implementation_complete` result for #50.

### Outcome 3: Close and prove the Run
- Work: Serialize `close-issue` only after candidate reachability, exact worktree absence, completion evidence, and close authority are read back; report the final status or a stable diagnosed stop.
- Risks/open questions: Closeout requires the close lease and target writer. Any changed or unavailable evidence stops without a retry that duplicates work.
- Verify: Live Tracker read-back, target ancestry, worktree absence, append-only Run journal, and final workflow status agree.
