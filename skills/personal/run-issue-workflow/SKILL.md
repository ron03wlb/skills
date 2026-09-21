---
name: run-issue-workflow
description: Reconcile and deliver explicitly selected Tracker Specs through one delivery authority and its native Issue lanes.
disable-model-invocation: true
---

# Run Issue Workflow

Run one bounded Tracker Spec as a DAG through one delivery authority, or an explicitly selected batch with an independent Run and Grant for each Spec. This skill is the sole Start and explicit re-entry authority. It coordinates existing `execute-issue` and `close-issue` leaves without replacing their contracts.

## 1. Select and bind one Run

`/run-issue-workflow <Spec-ID>` selects that exact Spec and authorizes its necessary Issue lanes and later execution/close work. Pass this identity to the delivery host; its owning sources read the body, comments, classification, target, approved scope, Planning Seal and Decomposition before action. Inspect only the scope or diagnosis the current action needs. Reject missing, contradictory, stale, or inaccessible authority.

`/run-issue-workflow <Spec-A>,<Spec-B>` explicitly selects a batch. It shares a worker bound (default three), observes all existing selected workers before dispatch, and rotates one ready action per Run while preserving each Run limit. Close waits consume no worker slot. Unselected Specs never start.

Explicit Spec or batch selection includes matching completed Runs: reconcile current canonical identity and scope against their original Grants and packages. A cached `SUCCEEDED` is only a discovery hint; observed completion permits no execution, verification or close replay. STOPPED, changed scope and ambiguous identities retain their gates.

A no-argument invocation resumes only one unique non-terminal Run from current journals and live evidence. Zero candidates require a Spec ID; multiple candidates require explicit selection; otherwise take no workflow action. Never select from a global queue, title, recency, or label alone.

Bind an immutable Run identity to the exact Spec, Issue target branch, classification, approved scope hash, and, for Multi-Issue, exact decomposition identity. A Single-Issue Run contains only the Spec Issue. A Multi-Issue Run contains every mapped child, and published blocker edges alone determine the ready frontier; never infer edges from paths, symbols, modules, titles, or overlap.

From the canonical repository identity, derive one versioned operation identity binding the stable Spec, approved publication identity or hash, producer `run-issue-workflow`, and stage `run`; caller correlation values never define authority. Match a stored current Run by that key, not Spec ID alone. Selected legacy Runs retain their journaled identity.

## 2. Reduce immediate-upstream authority

Before cleanup, writer acquisition, Grant creation or renewal, task action, or leaf mutation, read [the Run-ready handoff contract](references/run-ready-handoff.md) and reduce its owner facts. Consume [Run preparation](../../../docs/agents/run-preparation.md) before declaring readiness: prior approvals are reused, known missing permissions and declared SQL attestations belong to the planning owner before Start. Only `READY` may continue. `INCOMPLETE` returns the exact producer retry; `UNKNOWN` returns a stable fail-closed diagnosis; neither permits Run mutation.

After successful `READY` reduction and reconciliation, create one read-back DAG Run Grant or reuse the exact existing Grant for that identity. Record `max_parallel`, default three, in the append-only journal. Renewal cannot change identity or parallelism. The Grant authorizes only this Run's `execute-issue` and `close-issue` calls, never scope expansion, external-prerequisite execution, push, deployment, or ambiguity repair.

One prompt is the whole approval surface. When the reduction reports `run_preparation_pending`, ask the human exactly once for the reported questions, then record exactly those `{action, scope, authority}` entries on this Run's Grant (`grant.recorded.approvals`); the planning handoff's own approvals are reused first, and that Grant is the Run's single approval boundary for the declared operations it covers. Record the one Grant before the confirming read-back, dispatch only once the reduction is `READY`, and never ask again for an operation the same Run already approved: re-prompting for unchanged approved work is a defect, not diligence.

## 3. Run the delivery host

Read [the delivery host contract](references/delivery-host.md) only when starting, resuming, reconciling, or materializing a round. The Domain action reducer and append-only Run journal own legal actions, grants, six-hour Issue budgets, ten-wave material repair limits, waits, close eligibility, and terminal classification. `run-authority-adapters.mjs` reduces owning facts and `pi-workflow-host.mjs` plans exactly the legal actions the reducer returns. The selected GitHub or GitLab **Tracker Run sources** composition supplies provider facts; differences remain inside that adapter.

Use the stateless native stepper (`scripts/native-coordinator-step.mjs`). Every invocation reconstructs the round from the journal, tracker, Git/worktrees, and native run records, writes all reducer-authorized reservations before returning, and emits only bounded action metadata plus an artifact reference. Materialize `create_lane` with a fresh native subagent run, `resume_lane` against the exact previous native generation, and `observe_lane` read-only. Submit the harness result through `bind`; the v2 pointer chain rejects conflicting, stale, or discontinuous binds. `wait_owner`, `settle_control`, and `return_to_entry` stay with their named owners. Read [the optional pi-workflow materialization](references/pi-workflow-materialization.md) only when the operator explicitly selects that host.

Follow this order:

1. Reconcile tracker, Git/worktree, completion, journal, writer, and native-lane evidence.
2. Reserve every accepted action, then create or resume no more than `max_parallel` implementation lanes. Each prompt invokes exactly one leaf skill and stays inside the declared tool ceiling.
3. Treat `implementation_complete` as authority to serialize `close-issue`, never as node success.
4. Isolate diagnosis evidence while continuing the writer in the recorded Issue lane. A replacement requires journaled supersession first and retains the original operation and repair budget.
5. Release dependants only after their blocker is closed, its candidate is reachable from target, and its exact worktree is absent.
6. Close a Multi-Issue parent only after every child reaches node success; a Single-Issue Run ends when its sole node succeeds.

Hard gates: a lost launch response never creates a second lane; unknown ownership, stale generations, contradictory provider authority, an unreadable package, or an over-budget action stops. Close and healthy writer waits consume no execution slot or Issue budget. Only `close-issue` acquires the repository close lease and target writer. Pause, Resume, and Stop use revisioned domain settlement. Full round facts and journal evidence stay in bounded artifacts; default command output stays compact.

Use [OPERATOR.md](OPERATOR.md) for invocation, intervention, installation maintenance, and inspection. Examples are display fixtures, never authority.

## 4. Recover or stop

Read [Run recovery](references/recovery.md) only after a worker, tracker, environment, writer, or host failure. Apply its isolated technical diagnosis, bounded retries, tracker probes, and single recognized environment adapter exactly. Unknown ownership or contradictory identity always fails closed; never steal a lease, guess a lane, synthesize a handoff, repair product code, or silently expand scope.

Normal completion does not read full task history: the journal stores a compact allowlisted `task.outcome` receipt. Stop at reconciled `SUCCEEDED`, `STOPPED`, or a state with no legal action and no pending owning result. Keep healthy waits and pending calls with their original owner. For a real gate, use the recovery diagnosis; check existing human authority before interpreting a Skill as requiring another approval. Re-entry resumes only the next legal action from fresh evidence.

This personal coordinator uses the delivery host's own authority layer and one replaceable materialization at a time, with the shared installed package. It never becomes a background daemon, global scheduler, public plugin surface, aggregate push gate, deployment path, external-prerequisite runner, or self-modifying workflow.
