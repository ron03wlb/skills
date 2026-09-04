# Coordinator lifecycle

Read this reference only after the selected Run has a `READY` immediate-upstream handoff and a current DAG Run Grant. It solely owns runtime composition, reconciliation, Codex Issue lanes, legal reducer actions, target-writer waiting, and success criteria.

## Compose and control the Run

`run-workflow.mjs` is the single composition interface. Supply `authoritySources` containing canonical repository identity; owning-source Tracker/Decomposition, Git/worktree/completion-note reconciliation, Workflow checkpoint, handoff, target, and writer-liveness readers; plus Codex task, browser, shared leaf, and cleanup evidence. It rejects direct Tracker, `reconcile`, or `handoff.read` injection and builds internal adapters. Each runtime owns its active guard; each journal owns its `max_parallel`; separate Runs share no process-global guard, queue, coordinator, or execution-slot pool. After `READY` and the first valid status projection, the runtime opens the authenticated loopback panel and continues without a second Start.

Pause, Resume, and Stop append revisioned controls through the same active engine writer; Refresh is read-only. A paused coordinator keeps the same bridge active so Resume or Stop remains available in the same panel. Closing the panel changes no Run state. When the coordinator returns, the bridge closes before the writer is released, while the returned final status, journal, cleanup preview, and cleanup result remain inspectable. A panel-open failure stops before task action with `panel_unavailable`. Never persist or return the bridge token.

After exact explicit or unique no-argument selection and reconciled identity validation, invocation reads normalized retention evidence, produces the auditable cleanup preview, and applies the eligible terminal-Run sweep before acquiring a Run writer. The selected Run is always protected from deletion, including when evidence contradicts its reconciled identity. Zero or ambiguous no-argument selection produces only the read-only preview and takes no cleanup mutation. A `cleanupPreview: true` request performs the same proof and selection without deletion. Cleanup never runs because of Stop, closeout, or panel closure. Use [OPERATOR.md](../OPERATOR.md) for invocation and inspection; examples are not authority.

## Reconcile live evidence

On every entry and after every material transition, reacquire tracker evidence; registered worktree evidence from Git and candidate reachability from the Issue target branch; latest valid `implementation_complete`, `implementation_blocked`, and partial close evidence; Codex task lifecycle; and the append-only run journal, engine writer, and exact shared target-writer owner and liveness. Normalize those facts for `run-core.mjs` and rebuild the disposable projection with `run-store.mjs`. Only `reduceRun` legal actions authorize progress.

Re-entry adopts valid manual completion or node success, a settled task with valid completion evidence, an existing clean candidate, partial close progress, and unchanged completed nodes without duplicate tasks or leaf actions. Coordinator loss is fail-closed until explicit re-entry reacquires every source. Reclaim a stale engine writer only from exact reconciled `INACTIVE` owner evidence with no unaccounted active operation; otherwise leave it fenced and stop.

Treat an exact accepted `close-issue` follow-up proven by the Issue lane's task history as already in flight. Wait and reacquire evidence; never send the same close request again from coordinator memory. If valid manual `implementation_complete` has no journaled task reference, adopt one uniquely matching existing lane. Zero or multiple matches return a structured diagnosis; closeout never creates or guesses a duplicate lane.

## Bind one Codex Issue lane

Resolve the repository's exact saved project. Every executable Issue maps to one sidebar-visible child Codex task in that project's `local` environment. It invokes `execute-issue`, which owns its dedicated Issue worktree, topic branch, implementation, verification, review, and completion note. Product edits never belong in the shared checkout.

Before first dispatch, reread tasks and journal and adopt one uniquely matching lane whose Issue, Run, project, and prompt identity are proven. Only with none present create one child task whose prompt binds the Issue, Spec, Run, target, decomposition identity, and Grant. Require `threadId` and `hostId`, then append `dispatch.recorded`; a setup-only client reference never permits a duplicate. Use bounded `wait_threads`, read a settled task only for exact evidence, and use `send_message_to_thread` for same-task retry or serialized closeout. Never create a duplicate live lane.

Dispatch at most `max_parallel` execution or remediation actions. Closeout consumes no execution slot but shares the target writer. Healthy foreign target writer contention enters a bounded `WAITING_FOR_TARGET_WRITER` state and journals exact start and settlement events. The wait consumes no execution slot and never releases or reclaims another owner. After release, reacquire tracker, target, candidate, completion, worktree, control revision, and Grant; changed or unavailable evidence records `EVIDENCE_CHANGED` and returns a Recoverable blocker.

## Execute reducer actions

Treat `status.run.controlRevision` as authority for one action batch. Before every mutating action, reread the journal; revision drift abandons remaining actions and returns to reconciliation. An action already started is not cancelled.

- `reconcile_run`: reacquire all owning sources; it is read-only until a valid Grant exists.
- `dispatch_issue`: create or continue the one lane and let it invoke `execute-issue`; journal the attempt and task.
- `remediate_environment`: apply one exact recognized adapter for that attempt and fingerprint, journal it, and rerun the failed command in the same lane.
- `wait_target_writer`: observe the healthy owner for the reducer bound. On absence, reacquire and compare the pre-wait evidence before `RELEASED`; record `EVIDENCE_CHANGED`, owner change, timeout, coordinator loss, orphaned wait, or `CONTROL_CHANGED` without mutation.
- `close_issue`: require valid completion, acquire the target writer, send the same lane a `close-issue` follow-up under the unchanged Grant, wait, reacquire evidence, then release. Coordinator loss retains durable writer ownership; reclaim needs exact stale-owner evidence, and release still waits for task settlement.
- `close_parent`: after all children have node success, use the same target mutation-writer acquire-or-exact-reclaim seam, invoke parent-only `close-issue`, release only after the parent leaf settles, and reread parent state.
- `settle_pause` and `settle_stop`: append only the reducer-authorized transition after workers and target writer settle; they grant no cancellation or cleanup.

Valid `implementation_complete` triggers serialized `close-issue`; it is not node success. Only candidate reachability from the Issue target branch, absence of the exact worktree, and closed Issue state release dependants. All-child node success triggers the parent-only close path. A Single-Issue Run succeeds on sole-node success; a Multi-Issue Run succeeds only after the parent reads back closed. Independent ready branches may continue after an isolated failure, but target dirt, merge conflict, identity or Grant drift, contract ambiguity, and contradictory evidence stop target-wide progress.
