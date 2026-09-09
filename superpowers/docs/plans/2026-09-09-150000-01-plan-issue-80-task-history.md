# Issue 80 task acceptance and history recovery

**Goal:** Preserve the accepted close request across incomplete native task history without redispatching the same work.
**Why planning is required:** Native message acceptance and close continuation cross process and task boundaries; an incorrect retry reactivates an idle cleanup owner.
**Acceptance:** Exact Run, Issue, task, request and accepted prompt identities survive adapter restart. Native acceptance remains distinct from transport acknowledgement and execution outcome. Missing native history cannot authorize a resend. Reads are bounded to owner-relevant evidence. Existing progress and bounded continuation rules still apply. No tracker, native task, installation, or target mutation occurs in this maintenance worktree.

### Outcome 1: Durable exact message ownership
- Work: Add a small per-Run native message receipt to the Codex task adapter, reserved before submission and populated only from actual native acceptance or exact native read-back. Preserve accepted requests and results across adapter restart and detect contradictory identities.
- Verify: `node --test tests/ron-workflow/codex-workflow-tasks.test.mjs`

### Outcome 2: Bounded and trustworthy task evidence
- Work: Bound native history reads and retain only workflow-relevant input/final evidence. A settled accepted close with an unavailable result remains unresolved; an unchanged observed host-cleanup failure remains blocked while actual verified progress retains existing continuation behavior. A Multi-Issue parent's remaining tracker action requires every child to have a complete contribution, reachable candidate, absent worktree, and closed tracker state. Present native ownership that contradicts the receipt fails closed.
- Verify: `node --test tests/ron-workflow/codex-workflow-tasks.test.mjs tests/ron-workflow/close-continuation.test.mjs`

### Outcome 3: Compatible recovery contract
- Work: Update the owning recovery reference and inspect task-source integration without changing Grant, journal, model selection, target-writing, or helper-release authority. Commit only the reviewed scoped change.
- Verify: Run focused task/source/close integration checks, review the final diff and working tree, and report unproved native-host limitations separately.

### Outcome 4: Fresh tracker state at the close submission boundary
- Work: Before a native close message is submitted after any history read or continuation delay, reread the exact Issue's tracker state through its owning adapter. If that Issue has closed during the wait, suppress the native send and return to normal complete reconciliation. The guard must not declare success, erase receipts, change a Grant, or prevent an open Issue with proved physical cleanup from finishing closeout.
- Verify: A focused regression delays native history while the tracker changes from open to closed, proves zero sends and no new receipt, and retains the open-Issue continuation path. Rerun the affected task, close, and source integration checks.
