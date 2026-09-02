---
name: to-spec
description: Turn settled context into a checkpointed, retry-safe Spec publication and route its exact downstream handoff.
disable-model-invocation: true
---

# To Spec

Synthesize what is already settled; do not restart the interview. Use repository evidence and domain vocabulary, respect relevant ADRs, and prefer existing high-level verification seams.

The configured issue tracker, triage labels, Workflow checkpoint transaction store, and shared Target mutation writer must already exist; otherwise stop and tell the human to invoke `/setup-matt-pocock-skills` or the repository's explicitly documented workflow setup. Never create or repair those authority seams here.

## 1. Resolve the publication

Read any referenced Spec body, comments, prior partial-publication report, and matching Workflow checkpoint transaction. An existing Spec uses `revision` mode: update the same tracker Spec and do not create a duplicate. Otherwise use `primary` mode and create or reuse exactly one draft Spec identity after the clean-entry gate below.

`to-spec` is the sole authority for classifying a Tracker Spec:

- **Single-Issue**: one cohesive outcome fits one Issue worktree, execution context, reviewed candidate, and closeout.
- **Multi-Issue**: there are independently executable outcomes or blocking edges, or the work cannot safely fit one execution/review/closeout cycle.

File count, module count, risk, or apparent size alone never decides. Classify automatically from the settled requirements and repository evidence. Only material ambiguity that could change the route permits one blocking question with a recommendation; never default from uncertainty.

## 2. Draft the classified contract

User Outcomes are optional actor/value context, at most three, and never define done.

- A **Single-Issue** Spec is the executable authority. Stable `AC-n` Acceptance Criteria are its sole done authority. Expected paths and symbols are source-grounded starting points, not an allowlist. Every Acceptance Criterion must be covered by at least one Implementation Plan step and one Verification item; every Implementation Plan step must cover at least one Acceptance Criterion. Use inline `Covers: AC-n`, compare the defined and covered ID sets before publication, and stop on missing, unexpected, or orphan mappings without creating a matrix or parser.
- A **Multi-Issue** parent is decomposition authority only. Keep the overall outcome, cross-Issue constraints, decomposition rationale, exclusions, and `/to-tickets` handoff. Do not put child Acceptance Criteria, Implementation Plans, touchpoints, or verification commands in the parent; `/to-tickets` gives each child its own mapped executable contract.

The next command is authoritative: Single-Issue ends only with `/run-issue-workflow <Spec-ID>`; Multi-Issue ends only with `/to-tickets <Spec-ID>`. No Tracker Spec receives `/execute-issue` as its `to-spec` next command.

After classification, read only the matching template: `references/single-issue-template.md` or `references/multi-issue-template.md`. Do not load the unused shape's template. Generate the exact durable operational plan content in memory using the repository's plan convention, but do not write it yet.

## 3. Validate the Planning handoff

Require one visible Planning handoff from the active settled-context task, or the exact packet or renewed human scope confirmation in a fresh task. The packet binds the target, baseline, every accepted glossary or ADR exact path or hunk, and each expected content identity. Revalidate every bound Git identity and content against the repository before creating or reusing the Planning Seal.

A missing or conflicting packet, target, baseline, accepted glossary or ADR path or hunk, content identity, or ownership claim stops before planning commit, transaction, plan, Git, or tracker mutation. Never infer a handoff from dirty files or write a hidden replacement journal.

## 4. Select the Planning Seal

Select the local target-branch commit that seals approved glossary and ADR changes before tracker work becomes executable. This invocation authorizes at most one scoped local planning commit, its exact Workflow plan checkpoint commit, and the ordered tracker publication described below; it does not authorize implementation, push, integration, cleanup, Run start, or unrelated paths.

Before classifying the current delta on a retry, read any prior partial-publication state. If tracker read-back, the exact partial-state report, or the matching transaction records a verified Planning Seal, require that full SHA to exist locally and be an ancestor of current target `HEAD`, then reuse it. Missing or conflicting evidence stops; never replace it with current target `HEAD`.

- If there is no relevant planning-artifact delta and no recovered seal, reuse current target `HEAD` and do not create an empty commit.
- If exact approved paths or hunks contain the owned delta, acquire the shared Target mutation writer and commit only those changes while preserving unrelated staged, unstaged, and untracked work. Verify the full SHA, owned diff, target read-back, and unchanged unrelated snapshot, then release the writer. If owned hunks cannot be isolated from unrelated work, stop.
- Ambiguous ownership, scope, target identity, writer ownership, or read-back stops before further mutation.

Record the Seal as `created`, `successor`, or `reused`. A later transaction, tracker, or read-back failure retains the verified seal and reports its full SHA and exact partial state; do not amend, reset, or roll it back.

## 5. Start or resume the Workflow checkpoint transaction

After the Planning Seal is exact, a new Workflow checkpoint operation requires the exact target to be clean. Unrelated staged, unstaged, untracked, modified, mixed, or provenance-ambiguous work is preserved and stops before transaction, plan, Git, or tracker mutation. A primary operation then creates or reuses exactly one draft tracker Spec identity, reads it back, and binds it to the operation; a revision reuses the existing Spec identity.

Bind one versioned transaction to the repository identity, producer command `to-spec`, exact Spec operation and tracker identity, target, post-Seal baseline, initially clean state, exact durable plan path, and generated content identity. Create the Workflow checkpoint transaction before writing the plan. Advance only this ordered prefix: `plan.written`, `checkpoint.committed`, `attestation.read_back`, `publication.read_back`, `handoff.completed`.

Only one exact matching prior transaction may resume at its first unsatisfied stage. Re-read every completed result and require all bound identities to match. A mismatched producer, Spec, tracker identity, target, baseline, Planning Seal, path, content, commit, record, publication, handoff, multiple active transaction, or ambiguous state stops without regenerating, overwriting, duplicating, repairing, or attributing unrelated work.

For a fresh `plan.written` stage, write only the already bound generated content to the exact path and read its content identity back. For `checkpoint.committed`, acquire the shared Target mutation writer, revalidate the clean baseline and transaction, commit only the exact plan, and require the post-commit Git and target read-back to equal that checkpoint before releasing the writer. Acquisition failure stops before Git or tracker mutation. The writer covers only that bounded commit and required authority read-back.

After the checkpoint commit, automatically invoke model-invoked `attest-target-contribution` with the exact prospective packet owned by this producer. It binds the active producer, owner Spec identity, target, transaction identity, checkpoint commit, plan purpose, baseline, and read-back expectations. Require the exact reused or appended immutable `direct_target_contribution:v1` record identity back before advancing `attestation.read_back`; no second confirmation is permitted or required.

An exact retry never regenerates the plan, duplicates the plan or commit or evidence, switches the Planning Seal, creates another Spec identity, or asks for another confirmation. Completed transaction results remain immutable; do not mark them consumed, archive them, or delete them automatically.

## 6. Publish and complete the handoff

In primary mode, create or reuse one tracker Spec identity, bind it to the transaction, and require evidence read-back before completing its canonical body and `ready-for-agent` label. Populate only that bound draft after attestation read-back. In revision mode, require evidence read-back before updating the existing Spec. Never create a replacement Spec to recover a partial publication.

Read back the exact body, delivery classification, full Planning Seal SHA/state, target, selected template, `ready-for-agent` label, tracker identity, and next command. For Single-Issue verify every `AC-n` mapping; for Multi-Issue verify cross-Issue constraints and decomposition rationale exist and child-level executable sections remain absent. Only then advance `publication.read_back` with its immutable publication identity.

Append one immutable `handoff.completed` result bound to the producer, Spec and tracker identity, target, Planning Seal, checkpoint commit, immutable v1 record identity, publication identity, classification, and approved-scope identity. Read the completed receipt back exactly. A Single-Issue Spec ends only with `/run-issue-workflow <Spec-ID>`; a Multi-Issue Spec ends only with `/to-tickets <Spec-ID>`.

Any missing or conflicting Planning handoff, Seal, transaction, writer, commit, attestation, publication, handoff, target, classification, scope, or retry evidence stops without repair, rollback, duplicate tracker identity, Run start, implementation, push, or deploy. Every create or update and label mutation requires exact read-back. On any partial failure, report the transaction identity, checkpoint SHA and evidence identity when they exist, the exact first unsatisfied stage, verified Planning Seal full SHA and partial state; do not amend, reset, or roll back. Do not start Run, implement, push, or deploy.
