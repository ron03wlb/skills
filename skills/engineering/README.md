# Engineering

Skills I use daily for code work.

## User-invoked

Reachable only when you type them (Claude Code: `disable-model-invocation: true`; Codex: `policy.allow_implicit_invocation: false` in `agents/openai.yaml`).

- **[verify-target-before-push](./verify-target-before-push/SKILL.md)** — Verify a local-ahead or already-pushed completion-note range, including non-authorizing `workflowArtifacts`, with confirmation-gated direct-contribution, closed-Issue, or command-placeholder recovery and no push.
- **[push-target](./push-target/SKILL.md)** — Consume one current local-ahead `push_ready` receipt for one ordinary non-force push and exact remote read-back.
- **[ask-matt](./ask-matt/SKILL.md)** — Ask which skill or flow fits your situation. A router over the user-invoked skills in this repo.
- **[grill-with-docs](./grill-with-docs/SKILL.md)** — Grilling session that also builds your project's domain model, sharpening terminology and updating `CONTEXT.md` and ADRs inline.
- **[triage](./triage/SKILL.md)** — Move issues through a state machine of triage roles.
- **[improve-codebase-architecture](./improve-codebase-architecture/SKILL.md)** — Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick.
- **[setup-matt-pocock-skills](./setup-matt-pocock-skills/SKILL.md)** — Configure this repo for the engineering skills (issue tracker, triage labels, domain doc layout). Run once per repo.
- **[wiki](./wiki/SKILL.md)** — Inspect or update one repository Wiki independently, with validation, semantic review, repair, and a Wiki-only local commit.
- **[remove-ron](./remove-ron/SKILL.md)** — Remove only the retired repository-local Ron setup footprint while preserving shared configuration and history.
- **[to-spec](./to-spec/SKILL.md)** — Publish an execution-ready Spec with a Planning Seal through a retry-safe Workflow checkpoint and emit its exact Run handoff or decomposition command.
- **[to-tickets](./to-tickets/SKILL.md)** — Reconcile one Issue decomposition, publish its Decomposition publication record, and emit commands only for the ready frontier.
- **[implement](./implement/SKILL.md)** — Build an approved Standalone Spec or explicit direct task on the current branch with TDD and review.
- **[wayfinder](./wayfinder/SKILL.md)** — Plan a huge chunk of work — more than one agent session can hold — as a shared map of decision tickets on the issue tracker, resolved one at a time until the way to the destination is clear.

## Model-invoked

Model- or user-reachable (rich trigger phrasing so the model can reach for them).

- **[pre-execute-issue](./pre-execute-issue/SKILL.md)** — Prepare and attest one exact declared Issue prerequisite through content-bound Operator SQL outcomes.
- **[prepare-prerequisite-artifact](./prepare-prerequisite-artifact/SKILL.md)** — Build one adapter-bound, fail-closed Operator SQL prerequisite candidate without touching an external environment.
- **[execute-issue](./execute-issue/SKILL.md)** — Implement and fully verify one human- or DAG-authorized Issue, declaring exact `workflowArtifacts`, while preserving completion across recorded-target movement.
- **[close-issue](./close-issue/SKILL.md)** — Validate any `workflowArtifacts`, then resume three idempotent actions against one human- or DAG-authorized recorded target or close a verified Multi-Issue parent.
- **[attest-target-contribution](./attest-target-contribution/SKILL.md)** — Append or reuse exact authority evidence for eligible direct target contribution recovery or a producer-owned prospective Workflow plan checkpoint.
- **[record-closed-issue-reconciliation](./record-closed-issue-reconciliation/SKILL.md)** — Append or reuse immutable closed Issue evidence for human-confirmed failed-command or command-representation reconciliation.
- **[prototype](./prototype/SKILL.md)** — Build a throwaway prototype to answer a design question: a runnable terminal app for state/logic, or several toggleable UI variations.
- **[diagnosing-bugs](./diagnosing-bugs/SKILL.md)** — Disciplined diagnosis loop for hard bugs and performance regressions: reproduce → minimise → hypothesise → instrument → fix → regression-test.
- **[research](./research/SKILL.md)** — Investigate a question against high-trust primary sources and capture the findings as a cited Markdown file in the repo, run as a background agent.
- **[tdd](./tdd/SKILL.md)** — Test-driven development with a red-green-refactor loop. Builds features or fixes bugs one vertical slice at a time.
- **[domain-modeling](./domain-modeling/SKILL.md)** — Actively build and sharpen a project's domain model — challenge terms, stress-test with scenarios, update `CONTEXT.md` and ADRs inline.
- **[codebase-design](./codebase-design/SKILL.md)** — Shared discipline and vocabulary for designing deep modules: small interfaces, clean seams, testable through the interface.
- **[code-review](./code-review/SKILL.md)** — Two-axis review of the diff and any prospective workflow artifact declaration: **Standards** and **Spec**, run as parallel sub-agents; automatic activation also covers material security, data, concurrency, migration, contract, or cross-module risk before integration.
- **[resolving-merge-conflicts](./resolving-merge-conflicts/SKILL.md)** — Work through an in-progress git merge or rebase conflict hunk by hunk, resolving by intent traced to each side's primary source, then finish the operation — never `--abort`.
