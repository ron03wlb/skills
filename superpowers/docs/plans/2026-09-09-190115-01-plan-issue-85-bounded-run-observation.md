# Issue 85 bounded Run observation

**Goal:** Keep one Codex Issue Run recoverable and responsive while physical transport, native task observation, or host evidence is delayed or uncertain.
**Why planning is required:** The change crosses host transport, durable Run state, task/control timing, and tracker completion evidence, so the repository classifies it as High-risk.
**Acceptance:** Preserve the exact Run Grant, operation/request IDs, original task/worktree owner, 15-second heartbeat, and late outcomes; never infer cancellation or start a second writer from elapsed time. Persist each unresolved-fault identity with its own at-most-three read-only 5/15/30-second recovery rounds across restart/re-entry. Bound event observation to at most 60 seconds, batch at most eight task refs with host IDs/cursors, use 15/30/60-second fallback timing only when event notification is unusable, and reset only on material semantic change. Keep arbitrary native payloads, terminal data, credentials, and exception text out of durable checkpoints. Stop affected new operations on exhausted or contradictory evidence while leaving independent authorized work eligible. Publish `implementation_complete` only after the exact committed candidate passes focused/full verification, clean Standards and Spec review, clean-worktree read-back, and compatibility-record read-back; do not integrate, close, push, deploy, or clean unrelated work.

### Outcome 1: Bounded original-owner transport lifecycle
- Work: Update `skills/personal/run-issue-workflow/scripts/codex-host-driver.js` and `skills/personal/run-issue-workflow/scripts/codex-host-bridge.mjs` so physical writes and never-returning native calls remain owned and pending while their observation is bounded by the requested wait plus measured host overhead. Keep heartbeat/control scheduling independent, retain late settlement, and expose compact safe request/fault evidence without a replacement writer.
- Risks/open questions: The Codex host exposes no cancellation guarantee; timeout state must remain uncertainty rather than synthetic failure or replay authority.
- Verify: `node --test tests/ron-workflow/codex-host-driver.test.mjs tests/ron-workflow/codex-host-bridge.test.mjs`

### Outcome 2: One durable recovery budget per exact fault
- Work: Extend the existing driver checkpoint and Run-owned store/task adapter seams to retain allowlisted fault identities, consumed rounds, fixed 5/15/30-second schedules, owner/request references, and settlement state. Make every read-only adapter retry consume the same persisted budget for its exact unresolved fault so nested calls and re-entry cannot multiply it; healthy unchanged waits consume no rounds.
- Risks/open questions: Fault persistence must be atomic and identity-bound without recording raw native error or response content.
- Verify: `node --test tests/ron-workflow/codex-host-driver.test.mjs tests/ron-workflow/codex-workflow-tasks.test.mjs`

### Outcome 3: Event-driven compact task observation
- Work: Update `skills/personal/run-issue-workflow/scripts/codex-workflow-tasks.mjs` at its public `wait`/history seam to prefer cursor-aware `wait_threads`, split more than eight refs fairly, return early completion/attention deltas, and avoid full history reads for unchanged running observations. Add bounded 15/30/60-second fallback state only for unusable event notification, with semantic-change reset and independent Pause/Stop/execution-deadline handling.
- Risks/open questions: Cached observations are efficiency state only and must never replace fresh authority before an action.
- Verify: `node --test tests/ron-workflow/codex-workflow-tasks.test.mjs`

### Outcome 4: Measured evidence and workflow completion
- Work: Extend the three focused test files with deterministic clocks, stalled/late I/O, restart/re-entry, cursor batching and compact-delta cases. Update `docs/agents/codex-host-driver-evidence.md` and affected owning English instructions with reproducible memory, checkpoint latency/size, native-call, model-round-trip, returned-volume and available-token measurements, clearly separating virtual time from actual Windows elapsed observations.
- Risks/open questions: Actual token counts and multi-hour soak evidence may remain unavailable and must be reported as unavailable rather than inferred.
- Verify: `node --test tests/ron-workflow/codex-host-driver.test.mjs tests/ron-workflow/codex-host-bridge.test.mjs tests/ron-workflow/codex-workflow-tasks.test.mjs && node --test tests/ron-workflow/*.test.mjs && git diff --check`
