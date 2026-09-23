---
name: run-issue-workflow
description: Reconcile and deliver explicitly selected Tracker Specs through one delivery authority and its native Issue lanes.
disable-model-invocation: true
---

# Run Issue Workflow

Run one bounded Tracker Spec as a DAG, or an explicitly selected batch with an independent Run and Grant per Spec. This skill is the sole Start and explicit re-entry authority; it coordinates `execute-issue` and `close-issue` without replacing their contracts.

## 1. Select and bind one Run

`/run-issue-workflow <Spec-ID>` selects that exact Spec. Its owning sources read body, comments, classification, target, approved scope, Planning Seal, and Decomposition before action. Reject missing, contradictory, stale, or inaccessible authority.

`/run-issue-workflow <Spec-A>,<Spec-B>` selects only that batch. It shares the default-three worker bound, observes selected workers before dispatch, rotates one ready action per Run, and excludes close waits from worker slots. Matching completed Runs still reconcile canonical identity and scope against their original Grant/package: cached `SUCCEEDED` is discovery only and never replays execution, verification, or closeout.

A no-argument invocation resumes one unique non-terminal Run from live evidence and journals. Zero candidates require a Spec ID; multiple candidates require explicit selection; otherwise take no workflow action. Never select from a queue, title, recency, or label.

Bind the immutable Run identity to exact Spec, target, classification, approved scope hash, and Multi-Issue Decomposition identity. Published blocker edges alone determine the ready frontier. From canonical repository identity, derive one versioned operation identity from stable Spec, approved publication identity/hash, producer `run-issue-workflow`, and `run` stage; caller correlation never defines authority.

## 2. Reduce immediate-upstream authority

Before a Grant, task, or leaf mutation, read [the Run-ready handoff contract](references/run-ready-handoff.md) and reduce its owner facts. Consume [Run preparation](../../../docs/agents/run-preparation.md) before readiness. Only `READY` continues; `INCOMPLETE` returns its exact producer retry and `UNKNOWN` returns a stable fail-closed diagnosis.

After `READY` reconciliation, create or reuse the exact read-back DAG Run Grant and journal `max_parallel` (default three). It authorizes only this Run's `execute-issue` and `close-issue` calls. When preparation reports pending approval, ask once, record exactly the reported `{action, scope, authority}` on the Grant, confirm read-back, and reuse unchanged approval thereafter.

## 3. Run the delivery host

Read [the delivery host contract](references/delivery-host.md) only when starting, resuming, reconciling, or materializing a round. It owns native stepping, reservations/binds, Tracker Run source selection, lane materialization, the Domain action reducer, append-only journal, legal actions, grants, six-hour Issue budgets, ten-wave repair limits, waits, close eligibility, and terminal classification. Read [optional pi-workflow materialization](references/pi-workflow-materialization.md) only when the operator selects that host.

For each round, reconcile owning evidence, reserve reducer-approved actions, and materialize at most `max_parallel` implementation lanes. `implementation_complete` permits serialized `close-issue`, not node success. Dependants release only after their blocker is closed, candidate-reachable from target, and worktree-absent. A Multi-Issue parent closes after every child reaches node success; a Single-Issue Run ends with its sole node.

Only `close-issue` acquires the repository close lease and target writer. Pause, Resume, and Stop use revisioned settlement. Use [OPERATOR.md](OPERATOR.md) for invocation, intervention, installation maintenance, and inspection.

## 4. Recover or stop

Read [Run recovery](references/recovery.md) only after worker, tracker, environment, writer, or host failure. It owns technical diagnosis, retries, probes, and recognized remediation. Unknown ownership or contradictory identity fails closed.

Stop at reconciled `SUCCEEDED`, `STOPPED`, or no legal action after pending owner results settle. Keep healthy waits with their owner; re-entry resumes only the next legal action from fresh evidence. This coordinator never becomes a background daemon, global scheduler, public plugin surface, aggregate push gate, deployment path, prerequisite runner, or self-modifying workflow.
