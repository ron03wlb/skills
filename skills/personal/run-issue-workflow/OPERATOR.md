# Run Issue Workflow operator guide

## Intended path

Use this personal workflow after planning authority exists:

`GRILL` → approved Spec → `/to-tickets` for a Multi-Issue Spec → `/run-issue-workflow <main Issue>` → inspect or intervene → explicit resume when required.

A Single-Issue Spec runs as one node. A Multi-Issue Spec uses only the exact read-back decomposition and blocker edges. A no-argument `/run-issue-workflow` resumes only one unique non-terminal Run; zero or multiple candidates require an explicit Spec ID.

## Start or resume

Invoke `/run-issue-workflow <Spec-ID>` once. Successful reconciliation creates or renews the exact Run Grant, opens the loopback panel, and starts work immediately. There is no second Start control.

After one exact Run is selected and its identity is reconciled, invocation previews and applies the bounded terminal-Run retention sweep before writer acquisition. The selected Run is protected even if cleanup evidence contradicts reconciliation. Zero or ambiguous no-argument selection only previews; use `cleanupPreview: true` to inspect the same eligible set without deletion.

The runtime adapters must provide current Tracker, Git/worktree/completion-note, Codex task, shared leaf, browser, and cleanup evidence. They normalize evidence or execute an already-authorized action; they do not choose the ready frontier.

## Read the panel

The panel shows the current Run identity and state, published DAG edges, ready and active frontiers, task attempts, close evidence, diagnoses, and legal controls. It is a projection, not authority.

- **Pause** stops new actions after active work and the close writer settle; the same bridge stays open while the Run is paused.
- **Resume** in that same panel revises a paused Run and lets reconciliation decide what is now legal.
- **Stop** cooperatively revokes further work after active operations settle; it does not kill tasks or delete state.
- **Refresh** reads the newest projection and appends no journal event.

Closing the browser panel has no effect. The bridge closes automatically when the active coordinator returns at a terminal or diagnosed stop. Reopen the workflow explicitly after return; do not treat a stale browser snapshot as evidence.

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

## v1 boundaries

This is a personal, active-task workflow. It adds no Orca or App Server runtime, Linear or database dependency, global Spec picker, public skill promotion, push, deployment, external-prerequisite execution, or self-modifying behavior.
