---
name: run-issue-workflow
description: Reconcile and deliver explicitly selected Tracker Specs through the pi-workflow delivery host.
disable-model-invocation: true
---

# Run Issue Workflow

Run one bounded Tracker Spec as a DAG on the pi-workflow delivery host, or an explicitly selected batch with an independent Run and Grant for each Spec. This skill is the sole Start and explicit re-entry authority. It coordinates existing `execute-issue` and `close-issue` leaves without replacing their contracts.

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

## 3. Run the delivery host

The delivery host is the pi-workflow bundle at `workflows/deliver-tracker-spec/` inside this skill package. Read [the delivery host contract](references/delivery-host.md) only when starting, resuming, reconciling, or materializing a host round. The bundle owns scheduling facts and durable run records only: it never decides scope, grants, budgets, retries, repair routing, close eligibility, or stop classification.

The bundle's controller reaches the domain halves beside it: the owning-source adapter (`run-authority-adapters.mjs`) reduces tracker, reconciliation, target, checkpoint, handoff, and writer facts, and `pi-workflow-host.mjs` plans exactly the legal actions the Domain action reducer returns. Each executable Issue owns one lane: one isolated worker and one dedicated Issue worktree. An implementation lane follows `execute-issue`; a close lane follows `close-issue`; no worker can grant itself scope, a DAG Run Grant, or close authority.

The happy path is ordered:

1. Reconcile every tracker, Git/worktree, completion, journal, and writer source.
2. Dispatch dependency-ready Issues without exceeding `max_parallel`; every Issue has one lane. `execute-issue` owns its dedicated Issue worktree. A recorded creation intent prevents duplicate lanes after a lost response. Each Issue operation has one cumulative six-hour execution budget: implementation, retry, implementation repair, conflict repair, and their owned verification and independent review count; healthy dependency and writer waits are excluded. A new lane's tools are always a subset of the declared ceiling, and its prompt invokes exactly one contract skill.
3. Treat valid `implementation_complete` as authority to serialize `close-issue`, not as node success.
4. Diagnose concrete technical failures through an isolated task. Transfer exclusive Issue-worktree ownership only after the previous writer settles, retain the original operation and cumulative ten-wave material repair budget, and require verified replacement completion lineage before renewed close.
5. Release dependants only after the candidate is reachable from the Issue target branch, the exact worktree is absent, and the Issue is closed.
6. For Multi-Issue, invoke parent-only close after all-child node success; for Single-Issue, finish after its sole node succeeds.

Closeout and its waits consume no execution slot or Issue execution budget. The host only observes closeout availability; the real `close-issue` leaf alone acquires the repository close lease and then the target mutation writer. Healthy contention remains valid for at least twelve hours and has no elapsed-time reclaim rule.

Pause, Resume, and Stop go through the domain's revisioned control settlement; the host appends `pause.transitioned` or `stop.transitioned` only when the journal's latest control revision still authorizes exactly that command. A blocked host run that cannot be replayed is journaled as `run.superseded` before a new host run dispatches anything. Use [OPERATOR.md](OPERATOR.md) for invocation, intervention, recovery, and inspection; examples are display fixtures, never authority.

## 4. Recover or stop

Read [Run recovery](references/recovery.md) only after a worker, tracker, environment, writer, or host failure. Apply its isolated technical diagnosis, bounded retries, tracker probes, and single recognized environment adapter exactly. Unknown ownership or contradictory identity always fails closed; never steal a lease, guess a lane, synthesize a handoff, repair product code, or silently expand scope.

Normal completion does not read full task history: the journal stores a compact allowlisted `task.outcome` receipt. Stop at reconciled `SUCCEEDED`, `STOPPED`, or a state with no legal action and no pending owning result. Keep healthy waits and pending calls with their original owner. For a real gate, use the recovery diagnosis; check existing human authority before interpreting a Skill as requiring another approval. Re-entry resumes only the next legal action from fresh evidence.

This personal coordinator uses the pi-workflow delivery host and the shared installed package. It never becomes a background daemon, global scheduler, public plugin surface, aggregate push gate, deployment path, external-prerequisite runner, or self-modifying workflow.
