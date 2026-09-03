# Run Issue Workflow operator guide

## Intended path

Use this personal workflow after planning authority exists:

`GRILL` → approved Spec → `/to-tickets` for a Multi-Issue Spec → `/run-issue-workflow <main Issue>` → inspect or intervene → explicit resume when required.

A Single-Issue Spec runs as one node. A Multi-Issue Spec uses only the exact read-back decomposition and blocker edges. A no-argument `/run-issue-workflow` resumes only one unique non-terminal Run; zero or multiple candidates require an explicit Spec ID.

## Start or resume

Invoke `/run-issue-workflow <Spec-ID>` once. Successful reconciliation creates or renews the exact Run Grant, opens the loopback panel, and starts work immediately. There is no second Start control.

Before that authority or any mutation, Entry invokes the owning-source handoff adapter once with the already-read tracker and reconciliation snapshots, then reduces one immediate-upstream producer handoff. A fresh Single-Issue Spec consumes only `to-spec`'s publication and completed handoff. A fresh Multi-Issue Spec consumes only `to-tickets`' completed composite handoff with the upstream publication and handoff, operation receipt, and exact Decomposition identity, digest, mapping, and blocker edges; frozen legacy/profile-v1 handoffs retain their historical record identities. `READY` continues only when the live selected authority, including its Planning Seal, matches. `INCOMPLETE` returns the exact `/to-spec <Spec-ID>` or `/to-tickets <Spec-ID>` retry command, transaction identity, first unsatisfied stage, and producer-owned retry predicates only after the exact transaction and the same live selected authority agree; current producers never own target dirt, and known unrelated dirt does not change their retry. A mismatch returns `UNKNOWN` with the exact conflicting field plus observed and expected values. Other `UNKNOWN` results return a stable diagnosis, exact observed checkpoint and handoff values, and recovery predicates for missing, dirty, malformed, contradictory, stale, legacy, or ambiguous evidence. Neither state applies cleanup, acquires a writer, records a Grant, opens the panel, acts on a task or leaf, or repairs a producer; the returned cleanup preview remains read-only.

After one exact Run is selected and its identity is reconciled, invocation previews and applies the bounded terminal-Run retention sweep before writer acquisition. The selected Run is protected even if cleanup evidence contradicts reconciliation. Zero or ambiguous no-argument selection only previews; use `cleanupPreview: true` to inspect the same eligible set without deletion.

Provide repository owning sources for current Tracker/Decomposition, Git/worktree/completion-note reconciliation, Workflow checkpoint, producer handoff, target, writer liveness, Codex task, shared leaf, browser, and cleanup evidence. `run-workflow.mjs` passes those sources through repository-owned `run-authority-adapters.mjs`; callers do not implement `handoff.read` or duplicate upstream validation. The internal adapter derives one versioned Run-ready fact from existing snapshots plus one checkpoint classification read. Adapters normalize evidence or execute an already-authorized action; they do not choose the ready frontier.

## Read the panel

The panel shows the current Run identity and state, published DAG edges, ready and active frontiers, task attempts, close evidence, diagnoses, and legal controls. It is a projection, not authority.

- **Pause** stops new actions after active work and the target mutation writer settle; the same bridge stays open while the Run is paused.
- **Resume** in that same panel revises a paused Run and lets reconciliation decide what is now legal.
- **Stop** cooperatively revokes further work after active operations settle; it does not kill tasks or delete state.
- **Refresh** reads the newest projection and appends no journal event.

Closing the browser panel has no effect. The bridge closes automatically when the active coordinator returns at a terminal or diagnosed stop. Reopen the workflow explicitly after return; do not treat a stale browser snapshot as evidence.

## Observe target-writer waits

Healthy target writer contention projects `WAITING_FOR_TARGET_WRITER` and one bounded, paired journal wait. The start records the exact pre-wait Run, Grant, target, tracker, candidate, completion, worktree, and control-revision evidence. Ready Issue execution continues within that Run's own `max_parallel`; the wait consumes no Issue execution slot and never releases another Run's writer. When the writer releases, the coordinator reacquires and compares every recorded field. Only an unchanged comparison records `RELEASED`; changed or unavailable evidence records `EVIDENCE_CHANGED` and stops before closeout.

Unknown owner evidence, timeout, coordinator loss, or changed evidence returns a Recoverable blocker naming the owning source, exact evidence, smallest human action, preserved stages, and the same `/run-issue-workflow` command to retry. Do not steal a lease, close from the pre-wait snapshot, or use elapsed time as reclaim proof.

## Diagnose before intervening

Every non-progress result should name a stable reason, evidence, affected and unaffected nodes, attempted recovery, next owner, and Resume predicates. Resolve only the named predicate. Do not manually create a replacement lane, replay closeout, clean a dirty target, repair a merge conflict, or change Run identity while the Grant remains bound.

Tracker outage probes are fixed at 5, 15, and 30 seconds. Transient Issue-lane attempts are capped at three. Only the exact recognized Windows Gradle loopback fingerprint receives one process-local remediation cycle.

## Recover without duplication

On re-entry, the coordinator reads the journal and reacquires live Tracker, Git, worktree, completion-note, and Codex task evidence. It adopts trustworthy manual completion, a settled task, an accepted close request, partial close progress, and already-successful nodes. It never recreates or guesses an ambiguous lane.

Use an explicit Spec ID after a stopped Run, identity change, multiple candidate Runs, or any authority repair. Use no arguments only when one exact non-terminal Run is proven.

## Inspect after return

The composed runtime returns:

- the final versioned status projection;
- the validated append-only journal;
- a read-only cleanup preview;
- the applied cleanup result, or `null` for preview-only invocation;
- sanitized panel lifecycle metadata without the control credential.

The same status and journal remain under the repository's common Git directory after the bridge stops. Cleanup audit records remain inspectable independently of the panel.

Renderable examples:

- [`examples/status-succeeded.json`](./examples/status-succeeded.json)
- [`examples/status-diagnosed.json`](./examples/status-diagnosed.json)
- [`examples/status-waiting.json`](./examples/status-waiting.json)

## v1 boundaries

This is a personal, active-task workflow. It adds no Orca or App Server runtime, Linear or database dependency, global Spec picker, public skill promotion, push, deployment, external-prerequisite execution, or self-modifying behavior.
