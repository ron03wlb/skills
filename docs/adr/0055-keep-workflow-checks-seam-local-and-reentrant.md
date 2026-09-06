---
status: accepted
---

# Keep workflow checks seam-local and reentrant

Every workflow check has one **Workflow check disposition** owned by the interface where its evidence matters. A **Hard gate** is reserved for evidence that prevents wrong-target mutation, duplicate or misattributed publication, durable-state corruption, or unverified push. A **Recoverable blocker** reports the exact owning source, smallest human action, preserved stages, and retry command. Every other diagnostic is an advisory and cannot block valid business progress.

An exact upstream handoff is consumed through its read-back identity instead of causing downstream skills to rerun the producer's generation, review, or validation logic. Setup may diagnose installed seams but cannot authorize or deny an unrelated operation. A skill validates its own inputs and immediate mutation preconditions, keeping Issue logic in the producer or Issue lane that owns it rather than accumulating defensive checks in a central store or coordinator.

Known target dirt does not invalidate completed planning authority or stop independent Issue worktrees. It blocks integration into that target until the owner resolves it. Issue-scoped contradictions isolate only that Issue and its dependants; independent work continues. A conflicting Run identity or Grant remains a Run-wide gate because it cannot authorize any action in that Run.

Recovery uses **Same-command recovery**. After the human repairs the owning source, the same public command re-reads live evidence and resumes at its first unsatisfied idempotent stage. Healthy writer contention may wait within the active coordinator, but release authorizes continuation only after the journaled pre-wait evidence exactly matches a fresh owning-source reconciliation; unavailable, changed, ambiguous, or timed-out state returns an operator packet for later re-entry. We chose this over a generic `/resume`, workflow repair command, or `--force` switch because cross-skill repair would couple authority surfaces, while a universal bypass would turn correct safety gates into optional policy.

The installed Codex entry retains the exact compatible package selected by each Run. Re-entry resumes its observed unfinished work through current host tools, including an already-created task and worktree. Global package updates do not invalidate the retained version. Missing or modified trusted content is preserved with recovery information; a product Run never installs or rewrites its managing skills. Text status and Pause/Stop share the existing writer when the optional panel is unavailable. Scheduling requires the active coordinator; host heartbeat loss stops dispatch and releases its writer while preserving already-dispatched work. Broader contention, target-movement and conflict recovery remain owned by their existing runtime contracts.
