---
name: run-issue-workflow
description: Reconcile and deliver one exact Tracker Spec through Codex-native Issue lanes.
disable-model-invocation: true
---

# Run Issue Workflow

Run one bounded Tracker Spec as a Codex-native DAG. This skill is the sole Start and explicit re-entry authority. It coordinates existing `execute-issue` and `close-issue` leaves without replacing their contracts.

## 1. Select and bind one Run

`/run-issue-workflow <Spec-ID>` selects that exact Spec. Read its body, comments, classification, target, approved scope, Planning Seal, and read-back Decomposition publication record before workflow action. Reject missing, contradictory, stale, or inaccessible authority.

A no-argument invocation resumes only one unique non-terminal Run from current journals and live tracker evidence. Zero candidates require a Spec ID; multiple candidates require explicit selection; otherwise take no workflow action. Never select from a global queue, title, recency, or label alone.

Bind an immutable Run identity to the exact Spec, Issue target branch, classification, approved scope hash, and, for Multi-Issue, exact decomposition identity. A Single-Issue Run contains only the Spec Issue. A Multi-Issue Run contains every mapped child, and published blocker edges alone determine the ready frontier; never infer edges from paths, symbols, modules, titles, or overlap.

From the canonical repository identity, derive one versioned operation identity binding the stable Spec, approved publication identity or hash, producer `run-issue-workflow`, and stage `run`; caller correlation values never define authority. Match a stored current Run by that key, not Spec ID alone. Selected legacy Runs retain their journaled identity.

## 2. Reduce immediate-upstream authority

Before cleanup, writer acquisition, Grant creation or renewal, panel open, task action, or leaf mutation, read [the Run-ready handoff contract](references/run-ready-handoff.md) and reduce its owner facts. Only `READY` may continue. `INCOMPLETE` returns the exact producer retry; `UNKNOWN` returns a stable fail-closed diagnosis. Neither state permits Run mutation.

After successful `READY` reduction and reconciliation, create or renew one read-back DAG Run Grant for that identity. Record `max_parallel`, default three, in the append-only journal. Renewal cannot change identity or parallelism; Resume after Pause needs a revisioned setting change. The Grant authorizes only this Run's `execute-issue` and `close-issue` calls, never scope expansion, external-prerequisite execution, push, deployment, or ambiguity repair.

## 3. Run the composed lifecycle

Repository-owned `run-authority-adapters.mjs` binds owning-source authority; `run-workflow.mjs` is the single composition interface. After `READY` and Grant read-back, read [the coordinator lifecycle](references/coordinator-lifecycle.md) only when opening or controlling the panel, reconciling live state, dispatching or adopting an Issue lane, waiting for repository-close or target-writer availability, or executing a reducer action.

The happy path is ordered:

1. Reconcile every tracker, Git/worktree, completion, task, journal, and writer source.
2. Dispatch dependency-ready Issues without exceeding `max_parallel`; every Issue has one lane, and `execute-issue` owns its dedicated Issue worktree.
3. Treat valid `implementation_complete` as authority to serialize `close-issue`, not as node success.
4. Release dependants only after the candidate is reachable from the Issue target branch, the exact worktree is absent, and the Issue is closed.
5. For Multi-Issue, invoke parent-only close after all-child node success; for Single-Issue, finish after its sole node succeeds.

Closeout and its waits consume no execution slot. The coordinator only observes closeout availability and sends an evidence-bound request; the real `close-issue` leaf alone acquires the repository close lease and then the target mutation writer.

Pause, Resume, Stop, cleanup, retry, task adoption, and writer actions occur only through the lifecycle reference and runtime reducers. Use [OPERATOR.md](OPERATOR.md) for invocation, intervention, recovery, and inspection. Examples are display fixtures, never authority.

## 4. Recover or stop

Read [Run recovery](references/recovery.md) only after a worker, tracker, environment, writer, or coordinator failure. Apply its bounded retries, tracker probes, and single recognized environment adapter exactly. Unknown ownership or contradictory identity always fails closed; never steal a lease, guess a lane, synthesize a handoff, repair product code, or silently expand scope.

Stop at `SUCCEEDED`, `STOPPED`, or any state with no legal action. A blocked, failed, or paused result must name exact evidence, attempted recovery, retry count, affected and unaffected nodes, next owner, no-automatic-transition statement, and Resume predicates. Re-entry always reacquires live evidence and resumes only the next legal action without duplication.

This personal coordinator uses only current-host Codex task capabilities and repository-owned scripts. It never becomes a background daemon, global scheduler, public plugin surface, aggregate push gate, deployment path, external-prerequisite runner, or self-modifying workflow.
