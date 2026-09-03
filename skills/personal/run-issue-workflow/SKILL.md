---
name: run-issue-workflow
description: Reconcile and deliver one exact Tracker Spec through Codex-native Issue lanes.
disable-model-invocation: true
---

# Run Issue Workflow

Run one bounded Tracker Spec as a Codex-native DAG. This skill is the sole Start and explicit re-entry authority for the Run. It coordinates the existing `execute-issue` and `close-issue` leaves; it does not replace either leaf contract.

## Select and bind one Run

`/run-issue-workflow <Spec-ID>` selects that exact Spec. Read its body, comments, classification, target, approved scope, Planning Seal, and any read-back Decomposition publication record from the configured Issue tracker before taking workflow action. Reject missing, contradictory, stale, or inaccessible authority.

A no-argument `/run-issue-workflow` reads current run journals and live tracker evidence. Resume only one unique non-terminal Run. Zero candidates require a Spec ID, and multiple candidates require explicit selection; otherwise take no workflow action. Never select a new Spec from a global queue, title, recency, or label alone.

Bind one immutable Run identity containing the exact Spec, Issue target branch, Single-Issue or Multi-Issue classification, approved scope hash, and, for Multi-Issue, the exact read-back decomposition identity. A Single-Issue Run contains only the Spec Issue. A Multi-Issue Run contains every exact mapped child, and published blocker edges alone determine the ready frontier; never infer an edge from path, symbol, module, title, or apparent overlap.

Before cleanup, writer acquisition, Grant creation or renewal, panel open, task action, or leaf mutation, reduce the immediate-upstream producer evidence through the Run-ready handoff contract below. Only `READY` may continue. After successful `READY` reduction and reconciliation, create or renew one read-back DAG Run Grant for that identity. Record `max_parallel`, default three, in the append-only run journal. A renewal may not change identity or `max_parallel`; a paused Run requires a revisioned setting change before Resume. The Grant authorizes only this Run's `execute-issue` and `close-issue` calls. It does not authorize scope expansion, external-prerequisite execution, push, deployment, or ambiguous-state repair.

## Reduce the immediate-upstream handoff

The composition requires one owning-source `handoff.read` adapter. Invoke it once with the already-read tracker snapshot and current reconciliation snapshot; it reuses their selected Spec, target, Planning Seal, classification, approved-scope, tracker publication, and Decomposition facts and performs the one Git-common-dir Workflow checkpoint classification read needed to return `run-ready-handoff-facts:v1`. It is a compact fact set, not another tracker, target, or history fetch or a validation workflow. A fresh Single-Issue Run reads only the current `to-spec` publication and completed handoff. A fresh Multi-Issue Run reads only the current `to-tickets` handoff, which binds the upstream publication, upstream handoff, exact operation receipt, and the valid `decomposition:v1` identity, digest, mapping, and blocker edges. Frozen legacy/profile-v1 handoffs retain their historical immutable record identities. Run never coordinates two producer transactions or trusts titles, labels alone, plan filenames, cached status, or inferred history.

Reduce that fact with the pure `run-core.mjs` Run-ready reducer:

- `READY` requires the selected Spec, target, Planning Seal, classification, approved-scope identity, expected producer, completed handoff and transaction, required tracker publication identities, clean target, and Multi-Issue decomposition identity to agree. A current Multi-Issue handoff must additionally match its exact operation and tracker read-back, including the upstream identities, operation stage receipts, decomposition digest and mapping, ready frontier, and blocker edges. Completed immutable transaction receipts are readable and non-blocking.
- `INCOMPLETE` requires one exact consistent `to-spec` or `to-tickets` transaction whose producer profile, Spec, target, Planning Seal, classification, approved-scope identity, baseline, transaction identity, and first unsatisfied stage are all bound. A current producer never owns target dirt; known unrelated dirt does not change its producer retry, while unknown or purported current-producer ownership is `UNKNOWN`. A frozen legacy/profile-v1 transaction additionally binds its initially-clean state, plan path, and generated-content identity, and only that frozen transaction may prove exact producer-owned dirt. Return the exact `/<producer> <Spec-ID>` retry command, compact evidence, producer as next owner, and retry predicates before any Run mutation. Run never resumes the producer, commits its plan, attests, publishes, relabels, or deletes the receipt.
- `UNKNOWN` covers missing, unreadable, malformed, contradictory, multiple, stale, drifted, legacy plan-only, dirty-target-without-owner, and identity-ambiguous evidence. Return a stable reason code, exact observed checkpoint and handoff producer, Spec, target, Planning Seal, classification, scope, record, and decomposition values, affected Spec and target, next owner, no-automatic-transition statement, and recovery predicates. Never guess ownership, synthesize a handoff, treat ordinary dirt as producer work, or fall through to dispatch.

Compare both `READY` and actionable `INCOMPLETE` authority with the live selected reconciliation. Any mismatch becomes `UNKNOWN` with the exact conflicting field, observed handoff value, and expected selected value; never return a retry command for stale producer authority.

This Entry boundary does not revalidate producer generation, generated-content hashes, whole-commit checkpoint eligibility, v1 record semantics, producer review or tests, aggregate coverage, or producer retry correctness. Those remain owned upstream. The coordinator consumes the reducer result before `onSelected`, so non-`READY` results may perform the existing read-only cleanup preview on return but cannot apply cleanup, acquire an engine or target writer, append a Grant, open the panel, create or message a task, invoke a leaf, or mutate tracker or Git state.

## Run the composed lifecycle

`run-workflow.mjs` is the single composition interface for the active Run. Supply the owning-source Tracker, Git/worktree/completion-note, Workflow checkpoint handoff, Codex task, browser, shared leaf, and cleanup-evidence adapters. Keep ordinary normalization in `reconcile`, create the one Run-ready fact set through `handoff.read`, and keep every transition decision in the reducers and coordinator. After `READY` and the first valid reconciled status projection, the runtime opens the authenticated loopback panel and immediately continues execution without a second Start.

The panel reads only the disposable status projection. Pause, Resume, and Stop append revisioned controls through the same active engine writer used by the coordinator; Refresh is read-only. A paused coordinator keeps the same bridge active so Resume or Stop remains available in the same panel. A closed browser panel changes no Run state. When the active coordinator returns, the bridge closes before the writer is released, while the returned final status, journal, cleanup preview, and cleanup result remain inspectable. A panel-open failure stops before task action with `panel_unavailable`. Never persist or return the bridge control token.

After exact explicit or unique no-argument selection and reconciled identity validation, invocation reads normalized retention evidence, produces the auditable cleanup preview, and applies the eligible terminal-Run sweep before acquiring a Run writer. The selected Run is always protected from deletion, including when cleanup evidence contradicts its reconciled identity. Zero or ambiguous no-argument selection produces only the read-only preview and takes no cleanup mutation. A `cleanupPreview: true` request performs the same proof and selection without deletion. Cleanup never runs because of Stop, closeout, or panel closure.

Use [OPERATOR.md](./OPERATOR.md) for invocation, intervention, recovery, and inspection guidance. The `examples/` directory contains renderable terminal and diagnosed status snapshots; neither example is workflow authority.

## Reconcile live evidence

On every entry and after every material task or leaf transition, reacquire:

- current Spec, child Issue, blocker, and parent tracker evidence;
- candidate reachability, target cleanliness, and registered worktree evidence from Git;
- latest valid `implementation_complete`, `implementation_blocked`, and partial close evidence;
- current Codex task lifecycle for every journaled task reference;
- the append-only run journal, engine writer, and shared target mutation-writer state.

Normalize those owning-source facts for `run-core.mjs`; use `run-store.mjs` to rebuild the disposable status projection. Only `reduceRun` legal actions authorize progress. Never let a task summary, cached tracker response, panel state, or coordinator memory override current evidence. Any contradiction fails closed with the reducer's structured diagnosis.

Re-entry adopts valid manual completion or node success, a settled task with valid completion evidence, an existing clean candidate, partial close progress, and unchanged completed nodes. It then continues from the current legal action without duplicate Codex tasks, duplicate `execute-issue`, duplicate close actions, or replay from the first node. Coordinator loss is fail-closed: no new dispatch or close occurs until a later explicit invocation reacquires every live source.

Reclaim a stale engine writer only from exact reconciled `INACTIVE` owner evidence with no unaccounted active operation. Otherwise leave the writer fenced and stop.

Treat an exact accepted `close-issue` follow-up proven by the Issue lane's task history as already in flight. Wait on that lane and reacquire tracker, Git, and worktree evidence; never send the same close request again from coordinator memory alone.

If valid manual `implementation_complete` evidence has no journaled task reference, adopt one uniquely matching existing Issue lane for serialized closeout. Zero or multiple matches stop with a structured diagnosis; closeout never creates or guesses a duplicate lane.

## Bind one Codex Issue lane

Resolve the repository's one exact saved project before dispatch. Every executable Issue maps to one sidebar-visible child Codex task in that saved project's `local` environment. The child task works from the shared saved project only long enough to invoke `execute-issue`; `execute-issue` owns its dedicated Issue worktree, topic branch, implementation, verification, review, and completion note. Product-file edits never belong in the shared checkout.

For the first dispatch:

1. Read current tasks and the journal again. Adopt one uniquely matching existing lane when its Issue, Run, project, and prompt identity are proven; ambiguity stops.
2. Only when no live or adoptable lane exists, create one child task. Its user-visible prompt names the exact Issue, linked Spec, Run ID, target, decomposition identity when present, and tells it to invoke `execute-issue` under the read-back DAG Run Grant.
3. Require a usable `threadId` and `hostId`, then immediately append `dispatch.recorded`. A setup-only client reference is not a dispatch reference and never permits a duplicate task.

Use bounded `wait_threads` calls with the journaled host/thread reference to observe progress. Use `read_thread` only when a settled, attention, or failure result needs exact evidence. Use `send_message_to_thread` for a same-task retry or serialized `close-issue` follow-up. Keep the latest wait cursor process-local; the journal stores task identity and attempts, not disposable polling state.

Dispatch no more than `max_parallel` execution or remediation actions at once. Closeout does not consume an execution slot, but it shares the one target mutation writer used by planning producers for that Issue target branch. Never create a duplicate live lane for an Issue.

## Execute reducer actions

Repeat reconciliation and execute only the returned legal actions:

Treat `status.run.controlRevision` as the authority revision for that exact action batch. Immediately before each mutating `dispatch_issue`, `remediate_environment`, `close_issue`, `close_parent`, `settle_pause`, or `settle_stop` action, re-read the journal and compare its latest control revision. When the revision differs, abandon every remaining action in the stale batch and return to full reconciliation. A control appended after an action starts does not cancel it, but it fences every later mutating action. `reconcile_run` remains read-only.

- `reconcile_run`: reacquire every owning source and rebuild status. It is read-only until a valid Grant exists.
- `dispatch_issue`: create or continue the Issue's one Codex task, then let that task invoke `execute-issue`. Journal the exact attempt and task reference.
- `remediate_environment`: apply only the exact recognized adapter once for that Issue attempt and fingerprint, journal it, rerun the exact failed command in the same lane, and preserve its real result.
- `close_issue`: require a valid `implementation_complete`, acquire the shared target mutation writer, send the same Issue lane a `close-issue` follow-up under the unchanged Grant, wait for it to settle, reacquire tracker/Git/worktree evidence, then release the writer. A timeout or coordinator loss retains durable writer ownership; only exact reconciled stale-owner evidence may reclaim it, and release still waits for task settlement.
- `close_parent`: after every exact child has node success, use the same target mutation-writer acquire-or-exact-reclaim seam and invoke parent-only `close-issue` in the coordinator task. Release only after the parent leaf settles, and re-read parent state before declaring delivery success.
- `settle_pause` or `settle_stop`: append only the reducer-authorized transition after active workers and the target mutation writer have settled. These actions create no worker cancellation or cleanup authority.

Valid `implementation_complete` triggers serialized `close-issue`; it is not node success. Only candidate reachability from the target, absence of the exact Issue worktree, and closed Issue state release dependants. All-child node success triggers the existing parent-only close path. The Run succeeds only after the parent is read back closed for Multi-Issue, or the sole Spec node has node success for Single-Issue.

Independent dependency-ready branches may continue when an isolated node fails. Target dirt, merge conflict, identity or Grant drift, contract ambiguity, and contradictory Git or tracker evidence stop target-wide progress instead of guessing or repairing it.

## Bound retries and outages

A transient worker or task failure permits at most three dispatch attempts for that Issue. Reuse the same task when it remains reachable. Create a replacement only after the prior task is proven unable to continue and append one `retry.recorded` relationship with exact inactive evidence before the next dispatch is accepted. Semantic failure, `implementation_blocked`, merge conflict, Scope change, authority mismatch, and contradictory evidence bypass the retry budget and enter their defined stop immediately.

Before sending a same-task retry, reacquire that lane's task history. An exact accepted retry follow-up for the same Run, Issue, and next attempt is already in flight; journal the recovered retry relationship without sending the prompt again.

Cached tracker data never authorizes dispatch, completion, or closeout. After an initial tracker read failure, wait and make 5, 15, and 30 second tracker probes. Those probes do not consume the Issue retry budget. Already-running workers may settle locally, but stop at the next tracker-dependent boundary. On recovery, discard the outage snapshot and perform full reconciliation. After all three probes fail, return `tracker_unavailable` with the attempted probe schedule, affected nodes, next owner, and Resume predicates.

On restart, resolve any exact selector-known Run identity and node set from local authority before the first Tracker read. If that read and all probes fail, preserve the known Run and affected nodes in the diagnosis instead of returning an anonymous outage.

The only recognized automatic environment adapter in v1 is the Windows Gradle case: a `Selector.open()` probe whose exact result includes `java.io.IOException: Unable to establish loopback connection` may invoke `gradle-loopback-safe` for one reversible, process-local remediation cycle. Every other Gradle, JVM, tool, or environment failure remains untouched. A repeated exact fingerprint in the same dispatch attempt becomes `environment_unresolved`; the same fingerprint in a later valid attempt or a different failure is classified independently. A legacy `remediation.recorded` event without `attempt` is attributed only to the latest preceding dispatch for that Issue; missing, mismatched, future, duplicate, or otherwise ambiguous attempt evidence fails closed without rewriting the journal.

## Stop with a diagnosis

Stop at `SUCCEEDED`, `STOPPED`, or any state with no legal action. Every blocked, failed, or paused result reports the stable reason code, exact evidence, attempted recovery, retry count, affected and unaffected nodes, next owner, no-automatic-transition statement, and Resume predicates.

This personal coordinator uses only Codex task capabilities exposed by the current host and repository-owned runtime scripts. It never becomes a background daemon, global scheduler, public plugin surface, aggregate push gate, deployment path, external-prerequisite runner, or self-modifying workflow. Shared leaf repair happens in a separately authorized Issue and a later explicit re-entry reconciles the result.
