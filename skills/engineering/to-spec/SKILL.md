---
name: to-spec
description: Publish one settled Spec from its isolated planning lane through optimistic baseline revalidation and an exact Run handoff.
disable-model-invocation: true
---

# To Spec

Synthesize what is already settled; do not restart the interview. Use repository evidence and domain vocabulary, respect relevant ADRs, and prefer existing high-level verification seams.

The configured issue tracker, triage labels, current Workflow checkpoint profiles, concrete publication adapters, and shared Target mutation writer must already exist; otherwise stop and tell the human to invoke `/setup-matt-pocock-skills` or the repository's explicitly documented workflow setup. Never create or repair those authority seams here.

## 1. Consume the planning lane handoff

Require the active settled-context task's **Spec workflow lane** handoff. It binds one Codex task, one proposed Tracker Spec, one target, the starting baseline, the isolated planning worktree, and every accepted glossary or ADR exact path or hunk with its content identity. Require that worktree to remain registered to the same task and target. A missing handoff is a Recoverable blocker; a mismatched task, proposed Spec, target, worktree, baseline, path, hunk, content identity, or ownership claim is a Hard gate before mutation.

Read any referenced Spec body, comments, prior partial-publication report, and exact matching producer transaction. An existing Spec uses `revision` mode: update the same tracker Spec and do not create a duplicate. Otherwise use `primary` mode and reserve or reuse exactly one draft identity through the tracker adapter after the lane and Planning baseline gates below.

Multiple planning lanes may target the same branch. Consume only this task's lane; never use a shared planning checkout, global workflow lock, another lane's accepted decisions, or unrelated worktree state as publication evidence.

## 2. Draft the classified contract

`to-spec` is the sole authority for classifying a Tracker Spec:

- **Single-Issue**: one cohesive outcome fits one Issue worktree, execution context, reviewed candidate, and closeout.
- **Multi-Issue**: there are independently executable outcomes or blocking edges, or the work cannot safely fit one execution, review, and closeout cycle.

File count, module count, risk, or apparent size alone never decides. Classify automatically from the settled requirements and repository evidence. Only material ambiguity that could change the route permits one blocking question with a recommendation; never default from uncertainty.

User Outcomes are optional actor/value context, at most three, and never define done.

- A **Single-Issue** Spec is the executable authority. Stable `AC-n` Acceptance Criteria are its sole done authority. Expected paths and symbols are source-grounded starting points, not an allowlist. Every Acceptance Criterion must be covered by at least one Implementation Plan step and one Verification item; every Implementation Plan step must cover at least one Acceptance Criterion. Use inline `Covers: AC-n`, compare the defined and covered ID sets before publication, and stop on missing, unexpected, or orphan mappings without creating a matrix or parser.
- A **Multi-Issue** parent is decomposition authority only. Keep the overall outcome, cross-Issue constraints, decomposition rationale, exclusions, and `/to-tickets` handoff. Do not put child Acceptance Criteria, Implementation Plans, touchpoints, or verification commands in the parent; `/to-tickets` gives each child its mapped executable contract.

The next command is authoritative: Single-Issue ends only with `/run-issue-workflow <Spec-ID>`; Multi-Issue ends only with `/to-tickets <Spec-ID>`. No Tracker Spec receives `/execute-issue` as its `to-spec` next command.

After classification, read only the matching template: `references/single-issue-template.md` or `references/multi-issue-template.md`. Do not load the unused shape's template. Generate the canonical tracker body in memory. Ordinary publication creates no target operational-plan file or commit and no prospective `direct_target_contribution:v1` record.

## 3. Revalidate the Planning baseline and select the Planning Seal

Immediately before publication or an accepted-decision Planning Seal write, call the planning adapter to re-read only the relevant glossary, ADR, and source facts against the latest target ref. Compare those facts with the lane's starting baseline and accepted content; do not rerun unrelated planning, review, generation, or repository-wide diagnostics.

- Compatible target movement binds the latest baseline for this lane and continues.
- Relevant semantic drift returns a Recoverable blocker containing the owning source, observed evidence, smallest human action, preserved stages, and the same `/to-spec` retry after renewed human confirmation. Preserve the lane and do not merge the changed decision silently.
- A missing, ambiguous, unreadable, or conflicting target or lane identity is a Hard gate.

If there is no accepted glossary or ADR delta, reuse the latest baseline as the Planning Seal and create no empty commit. If there is one exact accepted delta, acquire the shared Target mutation writer, re-read the target ref and relevant facts, and materialize only those accepted paths or hunks as one scoped Planning Seal. Read the target ref, commit diff, and lane content identities back before releasing the writer. If the writer is healthy but occupied, wait only within its configured bound; timeout, unknown ownership, or content drift returns a Recoverable blocker without lease stealing. Preserve unrelated staged, unstaged, untracked, target, and lane work.

Record the Planning Seal as `created`, `successor`, or `reused`. A publication retry re-reads its prior `planning_seal.read_back` receipt and current relevant facts. Missing or conflicting read-back is a Hard gate; compatible later movement keeps the exact receipt valid and binds the latest observed baseline without rewriting it.

## 4. Start or resume the Spec producer transaction

Before the first transaction or tracker mutation, read [`references/spec-publication-interfaces.md`](references/spec-publication-interfaces.md) and use only its planning, checkpoint, tracker, and handoff adapters.

Resolve the tracker identity before transaction creation. In primary mode, call `tracker.reserve` with the exact operation identity, read one draft tracker identity and version token back, and reuse that same reservation on retry. In revision mode, require `tracker.read` of the existing Spec and its version token. Bind the read-back tracker identity to every later transaction and publication operation.

First search the exact operation for an existing valid incomplete transaction-v1 or `to-spec@v1` receipt. That compatibility branch has frozen exact resume behavior: continue its existing plan, checkpoint commit, attestation, publication, and handoff stages at the first unsatisfied stage. Do not migrate, copy, rewrite, delete, or recreate it, and never use its behavior to shape a fresh operation.

A fresh ordinary publication uses `to-spec@v2`. Bind one exact operation-scoped transaction to repository, Spec and tracker identity, producer `to-spec`, operation identity, profile `v2`, target, latest baseline, Planning Seal, classification, and approved-scope identity. Its ordered stages are `planning_seal.read_back`, `publication.read_back`, and `handoff.completed`. Advance the first stage only after the Planning Seal adapter's exact receipt reads back.

The current profile has no target operational-plan, plan-content, checkpoint-commit, or prospective-attestation stage. Target-checkout dirt outside the exact accepted Planning Seal write is preserved and is not transaction authority; only a ref, lane, or adapter identity conflict that risks the wrong mutation is a Hard gate.

Only one exact matching transaction may resume at its first unsatisfied stage. Re-read every completed receipt and require all bound identities to match. A missing transaction with observed downstream mutation, duplicate operation, mismatched receipt, out-of-order stage, or ambiguous adapter result stops without duplicate publication or attribution of unrelated work.

## 5. Publish and complete the handoff

Publish only the tracker identity and version token already bound to the transaction. Primary mode populates its reserved draft; revision mode updates the same existing Spec. Neither mode creates a replacement Spec to recover a partial publication.

Use compare-and-set publication. Read back the exact body, classification, full Planning Seal SHA/state, latest observed baseline, target, selected template, `ready-for-agent` label, tracker identity, version token, publication identity, approved-scope identity, and next command. For Single-Issue verify every `AC-n` mapping; for Multi-Issue verify cross-Issue constraints and decomposition rationale exist and child-level executable sections remain absent. Only then append the exact `publication.read_back` receipt.

Append or reuse one immutable `handoff.completed` receipt binding the producer, Spec and tracker identity, target, Planning Seal, transaction identity, publication identity, classification, and approved-scope identity. Read the handoff back, then advance the transaction's final stage with that immutable handoff identity. A Single-Issue Spec ends only with `/run-issue-workflow <Spec-ID>`; a Multi-Issue Spec ends only with `/to-tickets <Spec-ID>`.

## 6. Disposition and recovery

A **Hard gate** protects mutation identity: wrong target, duplicate or misattributed publication, conflicting lane or tracker identity, or ambiguous durable state. Stop before the next mutation and report the exact conflict.

A **Recoverable blocker** names the owning source, observed evidence, smallest human action, preserved stages, and the same `/to-spec` retry. Use it for relevant semantic drift, unavailable human confirmation, bounded writer timeout, or a readable owning source that needs repair. Recovery re-enters this skill and resumes at the first exact unsatisfied stage; there is no generic repair, resume, or force command.

An **advisory** cannot affect identity, attribution, durable state, or published behavior. Keep it visible; advisories never block, mutate authority, or become a waiver.

On any partial failure, report the lane, Planning Seal, latest observed baseline, tracker identity, transaction identity, immutable receipts, and first unsatisfied stage that exist. Preserve the planning worktree until successful handoff read-back. This skill never starts a Run, implements, decomposes, integrates, pushes, deploys, rolls back, or mutates another lane.
