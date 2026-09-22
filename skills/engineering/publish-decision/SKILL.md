---
name: publish-decision
description: Publish one settled documentation-only decision with Git and Tracker read-back, without starting delivery work.
disable-model-invocation: true
---

# Publish Decision

Publish one already-settled ADR or glossary decision. This route accepts only documentation changes and a Tracker decision record; it never creates a Run, Issue-execution lane, decomposition, SQL operation, deployment, or `ready-for-agent` label.

## 1. Bind one terminal decision

Require one settled scope, repository, target, relevant facts, exact document changes, and tracker title/body. Before the first Git or tracker mutation, obtain or reuse one explicit approval for those exact effects. A changed path, body, target, or tracker scope requires a new approval.

Use the configured producer adapter with `publication.classification: "DECISION_ONLY"`. Its v3 operation records the canonical title/body and SHA-256 digest in `workflow-operation-envelope:v1` before a mutation. The adapter’s identity, workspace, and receipts are implementation evidence, not user-facing inputs.

## 2. Write and read back

For document changes, use the isolated planner workspace and write one scoped Planning Seal; for tracker-only decisions, reuse the current target seal. Re-read the target and exact changed content after the Git write.

Advance the producer only through `planning_seal.read_back` and `publication.read_back`. The tracker update preserves existing labels, records one immutable publication receipt, and reads back the exact title, body, labels, and tracker version. `publication.read_back` completes the v3 transaction and its operation envelope.

## 3. Complete or stop

A successful `DECISION_ONLY` publication is terminal. Report the document and tracker read-backs with `COMPLETED`; do not call `to-tickets`, `run-issue-workflow`, `execute-issue`, or `close-issue`.

Changed facts, target, canonical body, tracker version, labels, ownership, or receipt identity stop before the next mutation and preserve the same envelope for retry. SQL, implementation requirements, executable acceptance criteria, deployment, or external prerequisites are outside this route; return them to `/grill-with-docs` and `/to-spec`.
