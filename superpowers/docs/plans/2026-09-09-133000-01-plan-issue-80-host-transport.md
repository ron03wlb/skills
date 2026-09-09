# Issue 80 host transport maintenance

**Goal:** Prevent the reproduced Codex bridge heartbeat starvation and unbounded reconciliation replay while preserving original native request identities and uncertain outcomes.
**Why planning is required:** This changes the governing workflow transport used by an authorized Run and must remain isolated from product candidates, tracker mutations, installation and cleanup ownership.
**Acceptance:** A large native response is delivered exactly once through bounded writes; slow durable checkpoint/control work does not suppress heartbeat traffic; lost acknowledgements query only relevant requests; bridge disconnects identify timeout, EOF or stream errors without leaking payloads. Existing interruption and secret-boundary regressions pass. Original Issue 80 incident timing remains distinguished from reproduced mechanisms.

### Outcome 1: Reproduce the transport failures
- Work: Add public driver/bridge tests for a large response whose single write exceeds the idle interval, slow checkpoint persistence and exact-ID recovery after many accepted requests.
- Verify: `node --test tests/ron-workflow/codex-host-driver.test.mjs tests/ron-workflow/codex-host-bridge.test.mjs`

### Outcome 2: Preserve delivery with bounded transport
- Work: Change only the shared driver and bridge, focused tests and matching reference/evidence. Use bounded, ordered response fragments with original-ID receipts; keep heartbeat traffic independent of durable shell work and keep physical writes serialized. Retain all native payloads in the active cell rather than writing secrets to checkpoints. Never replay an uncertain native tool call.
- Risks/open questions: A host tool that itself never returns is outside an in-process driver's ability to repair. Recorded old disconnects lack an explicit timeout/EOF reason; report that limit if retained timing cannot prove it.
- Verify: The original failing tests pass, including missing/conflicting fragments and restart boundaries; source-bound probe reports exact reconstructed payload and one native call.

Additional observed boundary: real child-process stdin contains a heartbeat during synchronous bridge work, but the expired timer runs before polling it. The watchdog now permits one I/O turn before final expiry. A current-host PTY fixture completed a 550,000-code-unit response in 148,080 ms across 99 writes; it exercised only emulated native data. Self-review also added a failing regression for a terminal frame returned by the final in-flight heartbeat, then repaired its final drain. The focused host suite passes 42 tests after that repair.

### Outcome 3: Deliver a reviewable maintenance candidate
- Work: Review the scoped diff, document the actual evidence and commit only this maintenance worktree's intended files. Installation and continuing the original Run remain with the parent owner.
- Verify: Focused host tests and the repository workflow suite pass; `git diff --check`; clean scoped commit read-back.
