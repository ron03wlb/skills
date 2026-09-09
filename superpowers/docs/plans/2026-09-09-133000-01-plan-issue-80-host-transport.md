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

### Outcome 4: Diagnose the remaining session 68633 timeout
- Evidence: The repaired live Run ended with `idle-timeout`, idle 90,548 ms and one pending read. Its final response is retained under the original request; all four native mutations were acknowledged. The final read returned in 777 ms. Its encoded transport contains an 8,566-character / 8,666-byte physical line, whereas the earlier successful PTY fixture reached only 6,120 characters per line.
- Work: Test heavily escaped synthetic data through a private current-host PTY fixture to distinguish physical input blocking from heartbeat timer lifetime. Confirm a behavioral red before changing transport, then bound the complete encoded frame if that cause reproduces. Preserve serialization, original IDs, idle disconnection, and all product Run state. A delayed injected yield alone cannot establish that compaction caused the actual incident.
- Verify: The same synthetic PTY case completes with one emulated native outcome, exact payload equality and no diagnostics; focused driver/bridge regressions pass. No broad suite, installation, tracker mutation or original-session operation belongs to this maintenance step.
- Result: The escaped single-frame and accumulated-state PTY fixtures both completed, so no physical-size/copy fix is supported. A delayed yield callback separately reproduced disconnection (180 ms callback, 100 ms watchdog). The smallest lifecycle repair keeps pulse ownership across the entire `run`, preserves standalone tick behavior and rejects overlapping entry. Focused coverage passes 45 tests. The actual session's idle timeout is confirmed, but its external scheduling trigger is not; do not present this lifecycle fix as proof of compaction recovery.
