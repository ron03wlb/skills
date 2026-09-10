# Issue 86 accepted-outcome reconciliation

**Goal:** Reconcile accepted Codex task, continuation-message, and control outcomes through their original durable owners without duplicating native mutations.
**Why planning is required:** This changes the public workflow recovery, ownership, and control contracts across the host driver, bridge, coordinator, durable receipts, and Run journal.
**Acceptance:** Issue 86 AC-1 through AC-6 pass against baseline `a341ffe856b7c4fe31525c9b37cdbd70d5ee1b99` in sole lane `C:/Users/ron.chang/.codex/worktrees/c7b6/skills` on `codex/issue-86-outcome-reconciliation`; the existing close receipt format remains readable without migration; checkpoints contain only allowlisted identity/progress/receipt references; no unknown outcome, stale control, omitted history, or elapsed delay authorizes a duplicate native effect; focused and full-suite checks pass; independent Standards and Spec review are clean; the lane stops before integration, closure, push, deployment, or worktree removal.

### Outcome 1: General continuation delivery has a durable original owner
- Work: Extend the existing Codex message receipt boundary and task adapter so retry, repair, and recovery prompts reserve an allowlisted operation identity before native delivery, record exact native acceptance or matching history, survive restart and omitted history, reject contradictory ownership/outcomes, and never resend an unresolved reserved or accepted message. Preserve historical close receipts and cumulative repair-wave evidence without storing additional raw native payloads.
- Risks/open questions: A receipt must remain evidence rather than authority, and an incomplete or conflicting append must fail closed without hiding native history.
- Verify: `node --test tests/ron-workflow/codex-workflow-tasks.test.mjs`

### Outcome 2: Driver requests and controls preserve original identity through loss
- Work: Retain allowlisted owner/receipt references for mutation requests, keep native payloads out of checkpoints, and make queued/sending controls carry their source identity and expected Run revision. Reconcile lost control results against fresh Run status; accept only the matching applied revision, reject stale replay after a newer revision, and keep independent controls processable while another control is unresolved.
- Risks/open questions: A pending native call or control remains owned until its actual result or authoritative current Run revision settles it; no synthetic ACK or provider exactly-once claim is allowed.
- Verify: `node --test tests/ron-workflow/codex-host-driver.test.mjs tests/ron-workflow/codex-host-bridge.test.mjs`

### Outcome 3: Coordinator and documentation expose the same recovery contract
- Work: Connect control-result handling to current `control.revised` status, keep the shared 5/15/30-second fault budget, update the owning English host-driver documentation/evidence, and add fault-injection coverage for accepted-before-recording, omitted history, restart, late/conflicting outcome, stale control, and secret-safe checkpoint behavior. Mark deterministic fixtures as simulated and record actual Windows observations separately.
- Material plan deviation (AC-4): Source tracing showed that `workflow-control-store.mjs` owns producer checkpoint controls, while active Run controls are owned by `run-journal.mjs`, `run-core.mjs`, `run-panel-bridge.mjs`, and `run-workflow.mjs`. The implementation follows those runtime owners and leaves the unrelated producer checkpoint store unchanged.
- Risks/open questions: Repository full-suite runtime is substantial; reuse is permitted only through the exact execution verification cache contract.
- Verify: `node --test tests/ron-workflow/*.test.mjs`
