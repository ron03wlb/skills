## What it does

`to-tickets` consumes the completed `to-spec` handoff for an approved Multi-Issue Spec, settles its own retry-safe Workflow checkpoint, and reconciles every child through an immutable Decomposition key. Each child keeps its Acceptance Criteria, mapped Implementation Plan, verification, blockers, target, and Planning baseline.

Its defining idea is the **tracer bullet**: each child is a narrow, verifiable vertical outcome. After the checkpoint evidence, every child, blocker, Decomposition publication record, and ready state pass read-back, the skill appends one composite `handoff.completed` and ends at `/run-issue-workflow <Spec-ID>`; it never reclassifies the parent or emits child execution commands.

## When to reach for it

You invoke this by typing `/to-tickets <Spec-ID>` — the agent won't reach for it on its own.

Reach for it only when [to-spec](https://aihero.dev/skills-to-spec) published a Multi-Issue next command and completed handoff. A Single-Issue Spec goes directly to the published `/run-issue-workflow <Spec-ID>` route.

## Prerequisites

[setup-matt-pocock-skills](https://aihero.dev/skills-setup-matt-pocock-skills) must have configured the tracker, labels, Workflow checkpoint transaction store, and shared Target mutation writer. The parent Spec needs a valid Planning Seal, explicit Multi-Issue classification, approved-scope identity, and exact completed `to-spec` handoff.

## Stable reconciliation

Every child is self-contained and depends only on its parent constraints and explicit blockers; it does not need to know whether sibling Issues execute concurrently. Inline `Covers: AC-n` references keep plan and verification traceable without a separate matrix or parser.

Decomposition keys make retries stable: exact tracker evidence is reused, while duplicate or conflicting identity sources fail closed. Owned blockers must be acyclic, and readable External blockers affect readiness while remaining read-only.

A new operation starts only from the clean target and exact upstream handoff. It binds the generated decomposition plan before writing, commits only that plan under the shared Target mutation writer, and obtains prospective `direct_target_contribution:v1` evidence before tracker publication. An exact retry resumes the first unproved stage without duplicating the plan, commit, evidence, children, relations, record, labels, or final handoff.

A complete, read-back Issue decomposition gains one Decomposition publication record, an exact dependency-ready frontier, and one composite handoff binding both producer evidence identities plus the publication identity and digest. A wide mechanical refactor that cannot stay green as vertical slices uses expand-contract instead.

Exact in-Spec planning refinements may create one successor Planning Seal. Changes to behavior, acceptance, target, or exclusions return to `to-spec`; child publication never silently expands or edits the parent.

## It's working if

- A retry reuses matching child keys instead of creating duplicates.
- The Decomposition publication record binds the exact key mapping and blocker edges only after complete read-back, and the composite handoff follows ready-state read-back.
- Blocked or closed children receive no ready label, and the only emitted next command is `/run-issue-workflow <Spec-ID>`.

## Where it fits

`to-tickets` follows [to-spec](https://aihero.dev/skills-to-spec) and hands one composite Multi-Issue result to the repository's Run coordinator. The coordinator separately invokes [execute-issue](https://aihero.dev/skills-execute-issue) and [close-issue](https://aihero.dev/skills-close-issue) under its own valid DAG Run Grant; direct human leaf invocation remains available. See [ask-matt](https://aihero.dev/skills-ask-matt) for the whole flow.
