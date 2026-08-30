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

After successful reconciliation, create or renew one read-back DAG Run Grant for that identity. Record `max_parallel`, default three, in the append-only run journal. A renewal may not change identity or `max_parallel`; a paused Run requires a revisioned setting change before Resume. The Grant authorizes only this Run's `execute-issue` and `close-issue` calls. It does not authorize scope expansion, external-prerequisite execution, push, deployment, or ambiguous-state repair.

## Reconcile live evidence

On every entry and after every material task or leaf transition, reacquire:

- current Spec, child Issue, blocker, and parent tracker evidence;
- candidate reachability, target cleanliness, and registered worktree evidence from Git;
- latest valid `implementation_complete`, `implementation_blocked`, and partial close evidence;
- current Codex task lifecycle for every journaled task reference;
- the append-only run journal, engine writer, and target close-writer state.

Normalize those owning-source facts for `run-core.mjs`; use `run-store.mjs` to rebuild the disposable status projection. Only `reduceRun` legal actions authorize progress. Never let a task summary, cached tracker response, panel state, or coordinator memory override current evidence. Any contradiction fails closed with the reducer's structured diagnosis.

Re-entry adopts valid manual node success, a settled task with valid completion evidence, an existing clean candidate, partial close progress, and unchanged completed nodes. It then continues from the current legal action without duplicate Codex tasks, duplicate `execute-issue`, duplicate close actions, or replay from the first node. Coordinator loss is fail-closed: no new dispatch or close occurs until a later explicit invocation reacquires every live source.

Reclaim a stale engine writer only from exact reconciled `INACTIVE` owner evidence with no unaccounted active operation. Otherwise leave the writer fenced and stop.

Treat an exact accepted `close-issue` follow-up proven by the Issue lane's task history as already in flight. Wait on that lane and reacquire tracker, Git, and worktree evidence; never send the same close request again from coordinator memory alone.

## Bind one Codex Issue lane

Resolve the repository's one exact saved project before dispatch. Every executable Issue maps to one sidebar-visible child Codex task in that saved project's `local` environment. The child task works from the shared saved project only long enough to invoke `execute-issue`; `execute-issue` owns its dedicated Issue worktree, topic branch, implementation, verification, review, and completion note. Product-file edits never belong in the shared checkout.

For the first dispatch:

1. Read current tasks and the journal again. Adopt one uniquely matching existing lane when its Issue, Run, project, and prompt identity are proven; ambiguity stops.
2. Only when no live or adoptable lane exists, create one child task. Its user-visible prompt names the exact Issue, linked Spec, Run ID, target, decomposition identity when present, and tells it to invoke `execute-issue` under the read-back DAG Run Grant.
3. Require a usable `threadId` and `hostId`, then immediately append `dispatch.recorded`. A setup-only client reference is not a dispatch reference and never permits a duplicate task.

Use bounded `wait_threads` calls with the journaled host/thread reference to observe progress. Use `read_thread` only when a settled, attention, or failure result needs exact evidence. Use `send_message_to_thread` for a same-task retry or serialized `close-issue` follow-up. Keep the latest wait cursor process-local; the journal stores task identity and attempts, not disposable polling state.

Dispatch no more than `max_parallel` execution or remediation actions at once. Closeout does not consume an execution slot, but only one close writer may act on an Issue target branch. Never create a duplicate live lane for an Issue.

## Execute reducer actions

Repeat reconciliation and execute only the returned legal actions:

- `reconcile_run`: reacquire every owning source and rebuild status. It is read-only until a valid Grant exists.
- `dispatch_issue`: create or continue the Issue's one Codex task, then let that task invoke `execute-issue`. Journal the exact attempt and task reference.
- `remediate_environment`: apply only the exact recognized adapter once for that Issue attempt and fingerprint, journal it, rerun the exact failed command in the same lane, and preserve its real result.
- `close_issue`: require a valid `implementation_complete`, acquire the target close writer, send the same Issue lane a `close-issue` follow-up under the unchanged Grant, wait for it to settle, reacquire tracker/Git/worktree evidence, then release the writer. A timeout or coordinator loss retains durable close-writer ownership; only exact reconciled stale-owner evidence may reclaim it, and release still waits for task settlement.
- `close_parent`: after every exact child has node success, acquire the same target close writer and invoke parent-only `close-issue` in the coordinator task. Re-read parent state before declaring delivery success.
- `settle_pause` or `settle_stop`: append only the reducer-authorized transition after active workers and the close writer have settled. These actions create no worker cancellation or cleanup authority.

Valid `implementation_complete` triggers serialized `close-issue`; it is not node success. Only candidate reachability from the target, absence of the exact Issue worktree, and closed Issue state release dependants. All-child node success triggers the existing parent-only close path. The Run succeeds only after the parent is read back closed for Multi-Issue, or the sole Spec node has node success for Single-Issue.

Independent dependency-ready branches may continue when an isolated node fails. Target dirt, merge conflict, identity or Grant drift, contract ambiguity, and contradictory Git or tracker evidence stop target-wide progress instead of guessing or repairing it.

## Bound retries and outages

A transient worker or task failure permits at most three dispatch attempts for that Issue. Reuse the same task when it remains reachable. Create a replacement only after the prior task is proven unable to continue and append one `retry.recorded` relationship with exact inactive evidence before the next dispatch is accepted. Semantic failure, `implementation_blocked`, merge conflict, Scope change, authority mismatch, and contradictory evidence bypass the retry budget and enter their defined stop immediately.

Before sending a same-task retry, reacquire that lane's task history. An exact accepted retry follow-up for the same Run, Issue, and next attempt is already in flight; journal the recovered retry relationship without sending the prompt again.

Cached tracker data never authorizes dispatch, completion, or closeout. After an initial tracker read failure, wait and make 5, 15, and 30 second tracker probes. Those probes do not consume the Issue retry budget. Already-running workers may settle locally, but stop at the next tracker-dependent boundary. On recovery, discard the outage snapshot and perform full reconciliation. After all three probes fail, return `tracker_unavailable` with the attempted probe schedule, affected nodes, next owner, and Resume predicates.

On restart, resolve any exact selector-known Run identity and node set from local authority before the first Tracker read. If that read and all probes fail, preserve the known Run and affected nodes in the diagnosis instead of returning an anonymous outage.

The only recognized automatic environment adapter in v1 is the Windows Gradle case: a `Selector.open()` probe whose exact result includes `java.io.IOException: Unable to establish loopback connection` may invoke `gradle-loopback-safe` for one reversible, process-local remediation cycle. Every other Gradle, JVM, tool, or environment failure remains untouched. A repeated exact fingerprint becomes `environment_unresolved`; a different failure is classified independently.

## Stop with a diagnosis

Stop at `SUCCEEDED`, `STOPPED`, or any state with no legal action. Every blocked, failed, or paused result reports the stable reason code, exact evidence, attempted recovery, retry count, affected and unaffected nodes, next owner, no-automatic-transition statement, and Resume predicates.

This personal coordinator uses only Codex task capabilities exposed by the current host and repository-owned runtime scripts. It never becomes a background daemon, global scheduler, public plugin surface, aggregate push gate, deployment path, external-prerequisite runner, or self-modifying workflow. Shared leaf repair happens in a separately authorized Issue and a later explicit re-entry reconciles the result.
