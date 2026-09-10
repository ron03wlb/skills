---
name: run-issue-workflow
description: Reconcile and deliver explicitly selected Tracker Specs through Codex-native Issue lanes.
disable-model-invocation: true
---

# Run Issue Workflow

Run one bounded Tracker Spec as a Codex-native DAG, or an explicitly selected batch with an independent Run and Grant for each Spec. This skill is the sole Start and explicit re-entry authority. It coordinates existing `execute-issue` and `close-issue` leaves without replacing their contracts.

## 1. Select and bind one Run

`/run-issue-workflow <Spec-ID>` selects that exact Spec and authorizes its necessary Codex Issue tasks and later execution/close messages. Pass this identity to the installed entry; its owning sources read the body, comments, classification, target, approved scope, Planning Seal and Decomposition before workflow action. Inspect only the scope or diagnosis needed for the current action; full tracker history stays available on demand. Reject missing, contradictory, stale, or inaccessible authority.

`/run-issue-workflow <Spec-A>,<Spec-B>` explicitly selects a batch. It shares a worker bound (default three), observes all existing selected workers before dispatch, and rotates one ready action per Run while preserving each Run limit. Close waits consume no worker slot. Unselected Specs never start.

Explicit Spec or batch selection includes matching completed Runs: reconcile current canonical identity and scope against their original Grants and retained packages. A cached `SUCCEEDED` is only a discovery hint; observed completion permits no execution, verification or close replay. STOPPED, changed scope and ambiguous identities retain their gates.

A no-argument invocation resumes only one unique non-terminal Run from current journals and live tracker evidence. Zero candidates require a Spec ID; multiple candidates require explicit selection; otherwise take no workflow action. Never select from a global queue, title, recency, or label alone.

Bind an immutable Run identity to the exact Spec, Issue target branch, classification, approved scope hash, and, for Multi-Issue, exact decomposition identity. A Single-Issue Run contains only the Spec Issue. A Multi-Issue Run contains every mapped child, and published blocker edges alone determine the ready frontier; never infer edges from paths, symbols, modules, titles, or overlap.

From the canonical repository identity, derive one versioned operation identity binding the stable Spec, approved publication identity or hash, producer `run-issue-workflow`, and stage `run`; caller correlation values never define authority. Match a stored current Run by that key, not Spec ID alone. Selected legacy Runs retain their journaled identity.

## 2. Reduce immediate-upstream authority

Before cleanup, writer acquisition, Grant creation or renewal, panel open, task action, or leaf mutation, read [the Run-ready handoff contract](references/run-ready-handoff.md) and reduce its owner facts. Consume [Run preparation](../../../docs/agents/run-preparation.md) before declaring readiness: prior approvals are reused, known missing permissions and declared SQL attestations belong to the planning owner before Start. Only `READY` may continue. `INCOMPLETE` returns the exact producer retry; `UNKNOWN` returns a stable fail-closed diagnosis. Neither state permits Run mutation.

After successful `READY` reduction and reconciliation, create one read-back DAG Run Grant or reuse the exact existing Grant for that identity. Record `max_parallel`, default three, in the append-only journal. Renewal cannot change identity or parallelism; Resume after Pause needs a revisioned setting change. The Grant authorizes only this Run's `execute-issue` and `close-issue` calls, never scope expansion, external-prerequisite execution, push, deployment, or ambiguity repair.

## 3. Run the composed lifecycle

For explicitly approved model selection or an already policy-bound Run, read [model routing](references/model-routing.md) before dispatch or repair-yield continuation. It owns assessment, risk floors, versioned membership, frozen native settings and one bounded upgrade. Unbound historical Runs and existing/adopted tasks retain their settings.

Use the installed `scripts/installed-entry.mjs`, not a caller-built factory. The shared package's `codex-workflow.mjs` connects the current Codex host, real Git and GitHub readers through `run-authority-adapters.mjs` and the existing `run-workflow.mjs` composition interface. The consumer supplies only `docs/agents/workflow-host.json`. Read [the active Codex host driver](references/codex-host-driver.md) to launch and forward its allowlisted tools from this task.

The entry selects a trusted immutable package snapshot and journals its version on the Grant. Re-entry verifies the original retained content. A trusted current package may read known compatible records from the same source only after checking actual journal/recovery semantics and original task intents, beyond protocol numbers; it records the actual runtime version once while preserving the original Grant. Unknown formats or source changes remain isolated without rewriting history. Unavailable, modified or unproven packages preserve the Run and give recovery information. Installation never runs inside a product Run. For already-approved pre-Run maintenance, follow [its owner](../../../docs/agents/references/approved-pre-run-workflow-maintenance.md) through isolated repair and fresh continuation under the original Start. After `READY` and Grant read-back, read [the coordinator lifecycle](references/coordinator-lifecycle.md) only when opening or controlling the panel, reconciling live state, dispatching or adopting an Issue lane, waiting for repository-close or target-writer availability, or executing a reducer action.

The happy path is ordered:

1. Reconcile every tracker, Git/worktree, completion, task, journal, and writer source.
2. Dispatch dependency-ready Issues without exceeding `max_parallel`; every Issue has one lane. `execute-issue` owns its dedicated Issue worktree: the Codex task creates it, then execution verifies and adopts that exact worktree. A recorded creation intent prevents duplicate tasks after a lost response. Retry, repair, and recovery continuations reserve their allowlisted Run/Issue/message identity before native delivery; accepted or unresolved original owners survive restart and omitted task history without another send. A planning-prepared prerequisite lane is verified and adopted as that same task/worktree, then receives its first execution message under the Run Grant.
   Each Issue operation has one cumulative six-hour execution budget. Count implementation, implementation retry, material implementation repair, conflict repair, and their execution-owned verification and independent review. Persist monotonic or exact native elapsed evidence through retry, repair wave, task replacement, transport restart, and explicit re-entry; none creates a fresh allowance. Verified healthy dependency or writer waiting is excluded. Unknown elapsed, clock basis, or ownership stays explicit and authorizes no new execution, repair, retry, or close action.
3. Treat valid `implementation_complete` as authority to serialize `close-issue`, not as node success.
4. Diagnose concrete technical failures through an isolated task. Transfer exclusive Issue-worktree ownership only after the previous writer settles, retain the original operation and cumulative ten-wave material repair budget, and require verified replacement completion lineage before renewed close. Governing-workflow defects use a separate scoped maintenance worktree and exact installation owner; requirement conflicts return to planning.
5. Release dependants only after the candidate is reachable from the Issue target branch, the exact worktree is absent, and the Issue is closed.
6. For Multi-Issue, invoke parent-only close after all-child node success; for Single-Issue, finish after its sole node succeeds.

Closeout and its waits consume no execution slot or Issue execution budget. The coordinator only observes closeout availability and sends an evidence-bound request; the real `close-issue` leaf alone acquires the repository close lease and then the target mutation writer. Healthy contention remains valid for at least twelve hours and has no elapsed-time reclaim rule. An exact owner with unknown health uses the shared durable 5/15/30-second read-only fault policy; `UNKNOWN` is not inactive ownership and never permits release, reclaim, cancellation, or duplicate close dispatch.

At the cumulative six-hour boundary, append `execution.exhausted`, project `execution_timeout`, and stop scheduling new execution, repair, retry, or close actions for that Issue. Preserve the original task, worktree, candidate, receipts, and late native outcomes. Do not force-kill or claim cancellation; independent Multi-Issue branches may continue.

Pause, Resume, Stop, cleanup, retry, task adoption, and writer actions occur only through the lifecycle reference and runtime reducers. Pause, Resume, and Stop carry one durable control request ID and expected next Run revision; recovery inspects that exact journaled control and never replays an uncertain mutation. If the panel cannot open, the same writer continues with text status and Pause/Stop through the host driver. A disconnected coordinator stops dispatching; app closure never means background progress. Use [OPERATOR.md](OPERATOR.md) for invocation, intervention, recovery, and inspection. Examples are display fixtures, never authority.

## 4. Recover or stop

Read [Run recovery](references/recovery.md) only after a worker, tracker, environment, writer, or coordinator failure. Apply its isolated technical diagnosis/repair, bounded retries, tracker probes, and single recognized environment adapter exactly. Unknown ownership or contradictory identity always fails closed; never steal a lease, guess a lane, synthesize a handoff, repair product code, or silently expand scope.

For a settled Issue task with a helper-held empty directory, that reference routes one exact Windows recovery through the close owner's API from outside the Issue directory before declaring no legal action. Keep native task identity and existing close authority; the Issue task stays idle until physical cleanup is proved.

Stop at reconciled `SUCCEEDED`, `STOPPED`, or a state with no legal action and no pending owning result. Keep healthy waits and pending native calls with their original owner. For a real gate, use [the recovery diagnosis](references/recovery.md#stop-with-a-diagnosis); check existing human authority and the rule's precondition before interpreting a Skill as requiring another approval. Re-entry resumes only the next legal action from fresh evidence.

This personal coordinator uses only current-host Codex task capabilities and the shared installed package. It never becomes a background daemon, global scheduler, public plugin surface, aggregate push gate, deployment path, external-prerequisite runner, or self-modifying workflow.
