# End-to-end Codex Issue DAG workflow

**Goal:** Complete Issue #17 by composing the existing deterministic reducer, durable Run store, Codex-native coordinator, shared leaf adapters, and loopback panel into one bounded runtime interface, then prove the representative success, recovery, control, and diagnostic paths end to end.

**Why planning is required:** The runtime can create Codex Issue lanes, authorize serialized Issue and parent closeout, and accept durable Pause, Resume, and Stop controls. Its authority, recovery, and external-mutation boundaries are High-risk even though the implementation remains personal and dependency-free.

**Assumptions:** The coordinator remains the only scheduling authority and sole engine-writer owner. Tracker, Git/worktree/completion-note, Codex task, browser, and shared leaf behavior stay behind injected adapters. The panel is disposable and reads only the durable status projection; it never supplies evidence or Start authority. Every exactly selected invocation performs the ADR-0040 terminal-Run retention sweep, while preview-only or unselected no-argument invocation proves the same selection without deletion.

**Acceptance:** One explicit runtime invocation reconciles the exact Spec and opens the panel before automatic work proceeds; Single-Issue and branching Multi-Issue Runs obey node-success and serialized-close invariants; no-argument and interrupted re-entry adopt valid existing progress without duplicate work; accepted controls share the coordinator's journal writer; terminal or closed-panel state remains inspectable; stable diagnoses cover every named stop; and no public packaging, dependency, push, deploy, prerequisite, global picker, or alternate runtime surface is introduced.

### Outcome 1: One deep runtime composition interface

- Work: Add `skills/personal/run-issue-workflow/scripts/run-workflow.mjs` as the single composition seam. It previews and applies startup retention, constructs the coordinator with an optional panel lifecycle, opens the authenticated loopback bridge from the first valid Run projection without a second Start, routes controls through the coordinator-owned writer, keeps the bridge active while paused, closes it on terminal or diagnosed return, and returns final status, journal events, cleanup preview, and cleanup result.
- Supporting change: Extend `createCoordinator(...)` only with a narrow optional panel lifecycle. Keep reducer decisions, writer ownership, evidence precedence, and action execution in their current modules. Serialize panel controls through `createRunPanelControl` against the latest reconciled facts and the same active writer.
- Risks: A control arriving while the coordinator awaits tracker or task evidence must revise only the journal and rebuild from the latest reconciled facts; it must not race a second writer or turn stale panel state into authority.
- Verify: `node --test tests/ron-workflow/run-issue-workflow-end-to-end.test.mjs tests/ron-workflow/run-issue-workflow-panel.test.mjs tests/ron-workflow/run-issue-workflow-coordinator.test.mjs`

### Outcome 2: Representative success and recovery fixtures

- Work: Add temporary Git/local-tracker and fake Codex-task adapters that cross the real runtime, coordinator, journal, store, reducer, control, and bridge seams. Cover one-node success, branching ready-frontier dispatch up to `max_parallel`, dependency release only after node success, serialized child/parent closeout, manual completion, partial close, settled-task adoption after coordinator interruption, and unique no-argument resume.
- Test boundary: Fake only external Tracker/Git/worktree/completion-note/Codex/browser/leaf behavior. Do not stub the reducer, coordinator, Run store, journal, panel control, or bridge.
- Verify: `node --test --test-name-pattern="end-to-end" tests/ron-workflow/run-issue-workflow-end-to-end.test.mjs`

### Outcome 3: Diagnostic and control recovery matrix

- Work: Exercise isolated failure with independent continuation, blocked descendants, tracker probe exhaustion/recovery, dirty target, merge conflict, Grant or decomposition drift, contradictory evidence, exhausted transient retries, exact environment remediation success/failure, Pause/Resume, cooperative Stop, Refresh, panel closure, and bridge shutdown. Assert stable reason codes plus evidence, affected/unaffected nodes, next owner, and Resume predicates.
- Scope rule: Reuse focused core/coordinator tests where they already prove a boundary; add end-to-end cases only where composition or cross-module behavior is material.
- Verify: `node --test tests/ron-workflow/run-issue-workflow-core.test.mjs tests/ron-workflow/run-issue-workflow-coordinator.test.mjs tests/ron-workflow/run-issue-workflow-panel.test.mjs tests/ron-workflow/run-issue-workflow-end-to-end.test.mjs`

### Outcome 4: Personal operator contract and bounded packaging

- Work: Synchronize the personal skill, invocation metadata, personal README, panel status examples, and operator guidance for GRILL → Spec → `/to-tickets` → `/run-issue-workflow <main Issue>` → intervene/resume. Document automatic panel opening, lifecycle controls, retained inspection, and exact re-entry behavior. Keep promoted READMEs, public engineering docs, plugin manifest, package dependencies, Orca, App Server, Linear, database, push, deployment, external prerequisites, and self-modification untouched.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs tests/ron-workflow/wiki.test.mjs`

### Outcome 5: Candidate and independent review gate

- Work: Commit coherent TDD slices, run syntax/focused/full Ron workflow checks, inspect public packaging and the exact baseline-to-candidate diff, then run independent Standards and Spec reviews against baseline `42826105441fca12d93de0aa45638a25e0c0c71c`, Issue #17, parent #12, ADR-0040, and the child acceptance contracts. Repair confirmed in-scope findings for at most ten waves and rerun both axes after every repair.
- Verify: `node --test tests/ron-workflow/*.test.mjs`, `git diff --check 42826105441fca12d93de0aa45638a25e0c0c71c...HEAD`, no new production dependency, no personal-skill promotion, clean Issue worktree, and read-back `implementation_complete` evidence.
