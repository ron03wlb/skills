# Issue 80 exact Windows helper recovery repair

**Goal:** Diagnose and repair the partial frozen-helper cleanup failure without weakening exact process ownership or replaying historical batches.
**Why planning is required:** The adapter authorizes process termination and physical Issue worktree cleanup.
**Authority:** The user explicitly requested diagnosis, repair and closure of Issue 80. This isolated maintenance branch owns only Windows helper recovery. Root coordination owns installation, original-task recovery and tracker closure.
**Baseline:** `d074a8f4c84fd2c48bbae02c18edf5eb4d1f23e1`; branch `codex/fix-issue-80-helper-recovery-20260909`.
**Acceptance:** Reproduce the failure pattern with disposable Windows fixtures before applying a supported fix. Preserve original helper reservations and outcomes; do not terminate historical Issue helpers. Retain process handles, creation-time identity, exact directory verification, fresh task/lease/integration checks, foreign-child rejection and one automatic batch per completion. Diagnostics identify the failed phase and process without raw commands. Focused Windows behavior checks and independent review must pass before integration.

### Outcome 1: Supported root cause
- Work: Inspect the three recorded partial batches and the native C#/PowerShell boundary; distinguish exited process, ancestry, inventory and parameter-read failures using bounded disposable processes.
- Verify: A failing behavioral regression reproduces the relevant current-directory helper topology and exit transition. Record any historical attribution limit.

### Outcome 2: Minimal guarded repair
- Work: Repair only the proved failing transition in the Windows cleanup owner, add secret-safe native read diagnostics and synchronize the host-cleanup reference where needed.
- Verify: Real Windows fixture recovery completes the frozen set, preserves host/unrelated processes, and still blocks new holders, foreign children, active tasks and lost audit acknowledgements.

### Outcome 3: Reviewed delivery
- Work: Inspect the final diff, run focused cleanup/close-owner checks and commit only these maintenance files. Report operational continuation requirements without clearing reservations or creating another automatic process batch.
- Verify: Focused passing results, exact committed file scope, and independent Standards/Spec review before root adopts the revision.

### Diagnosis and verification evidence

- All three historical batches stopped after releasing a nested Node REPL: 43340, 44372 and 51128. Their frozen computer-use launcher parents were 51888, 31748 and 11024. Fresh read-only process observations found all three launchers absent while the next selected helper remained alive. The installed computer-use `launch.mjs` exits its launcher after the child `close` event.
- A disposable Windows fixture with the same launcher/child exit relationship reproduced the exact error: child `EXITED` with termination requested, then launcher `NOT_RELEASED` with `Process parameters unreadable`. The old validator read remote process parameters before consulting the original retained handle for natural exit. Historical errors lacked a PID/phase, so the original failing read is not directly recorded; the matching native reproduction and launcher lifecycle establish the supported failure mechanism.
- The repair accepts natural exit only when the retained kernel process handle is signaled. It excludes those exited objects from live holder comparison and records their outcome without another termination. Live unreadability, changed identity, foreign children and a live child beneath an exited frozen ancestor remain blockers. Parameter-read diagnostics include PID, phase, field, Windows error and byte counts, but no addresses or raw commands.
- The regression passed after the repair. The full focused Windows helper, pending cleanup and close-continuation set passed **9/9**, including active-task rejection, foreign-child rejection, new-holder rejection, audit failure, prior-reservation preservation, exact nonrecursive removal and host/unrelated-helper survival. No original Issue helper was mutated by this maintenance task.
- Repository skill contracts passed **48/48**. The nested launcher regression passed again after the final native-source formatting and documentation synchronization; `git diff --check` passed. Independent review remains a root-owned pre-integration gate.
- Root requested a concrete one-off operator continuation for the separately authorized repair. Its module and pinned authority manifest are prepared only under the Git common directory, outside the product commit. They preserve all old reservation/result/progress bytes, restrict fresh discovery to the original unreleased identity subset, use the existing close-owner leases/assessment/integration APIs, reserve a separate single batch before effects and flush each outcome. Root owns independent review, installed-package binding, fresh native callbacks and live invocation.

### Native unloaded-task continuation

- The first live operator invocation stopped before an operator reservation or process effect: its native read exceeded the caller's 120-second timeout. The late exact response and an independent `wait_threads(timeoutMs: 0)` snapshot both reported native `notLoaded` with a completed latest turn. Preserve this attempted-call result and late response; neither authorizes a process batch nor supplies fresh evidence for the next attempt.
- The existing Run operator contract and native task adapter already classify `notLoaded` plus a completed latest turn as settled. Align the cleanup owner's predicate with that exact native state without rewriting it to `idle`; unfinished, failed, missing-turn, unknown and active states remain blockers. Verify through the read-only assessment and real Windows recovery surfaces.
- Prepare subsequent one-off callers under unique attempt filenames, request compact native `read_thread` evidence with exact ID/host/current-directory fields and bounded response freshness/deadline metadata, and keep the independent batch reservation fixed per Issue. A status-only `wait_threads` result cannot supply missing current-directory identity. The caller timeout does not cancel or permit replay of any process effect.
- The newly added `notLoaded` assessment regression failed on the original cleanup predicate and passed after alignment. The changed assessment and full real Windows recovery set passed **6/6**, including native unloaded state across discovery, each stop and physical absence, and rejection of active/unfinished/failed/missing/unknown states. Root's subsequent native reads completed in 222 ms, 45 ms and 102 ms for Issues 81, 82 and 83 respectively; those measurements do not support a sustained slow-native-API explanation for the earlier callback delay.
