---
name: attest-target-contribution
description: Append or reuse exact direct-target contribution authority evidence. Use when /verify-target-before-push hands off a human-confirmed eligible coverage-recovery packet or an active to-spec or to-tickets producer hands off its exact Workflow plan checkpoint.
---

# Attest Target Contribution

Append or reuse the narrow tracker authority record for exact eligible Direct target contributions. This helper accepts two exact caller routes: confirmation-gated recovery and a producer-owned prospective Workflow plan checkpoint. It never decides push or Run readiness and never replaces producer publication, Issue execution, closeout, review, or verification.

## Require one exact caller packet

For recovery, require an active `/verify-target-before-push` recovery and one exact confirmed recovery packet containing the owner Tracker Spec or Issue, Issue target branch, fixed `classification: non-product-workflow-governance-maintenance`, ordered full commit SHAs, per-commit purposes, and the complete tracker comment draft. Require evidence that the active verification workflow produced the packet only after its frozen selected-range coverage check found those commits uncovered and the human confirmed that exact draft once.

For prospective creation, require one packet from the currently active, explicitly human-invoked `to-spec` or `to-tickets` operation. It binds the producer, owner Spec identity, target, Workflow checkpoint transaction identity, one checkpoint commit, exact plan purpose, baseline, and read-back expectations. Require evidence that the same active producer invocation handed off this packet for its own checkpoint. The prospective route needs no second human confirmation.

A manual helper invocation, stale invocation, inferred plan, downstream Run, other workflow, or cross-route substitution stops without writing. Missing authority, multiple packets, conflicting route evidence, or any packet ambiguity also stops without guessed selection.

## Prove route-specific eligibility

Read repository instructions and tracker configuration. Apply common validation for owner, target, commit, ancestry, whole-diff, ordered-history, exact-reuse, overlap, and read-back while keeping each route's authority proof separate. Before mutation, re-read the exact owner and frozen refs, resolve every full SHA locally, inspect each whole commit diff, and revalidate that owner, target, commit, diff, eligibility, and ref identities still match the caller packet. Any owner, target, commit, diff, eligibility, or ref drift stops without writing or broadening authority.

Eligibility is limited to explicit human-directed, non-product workflow or governance maintenance outside an Executable Issue by design, with one unambiguous owning Tracker Spec or Issue. Active skill behavior, runtime or source, tests, configuration, dependencies, migrations, security, data, public APIs, any mixed commit, partial-path attestation, owner ambiguity, or a non-coverage failure is ineligible and stops without tracker mutation.

For confirmation-gated recovery, preserve the frozen-coverage trigger and every existing eligibility exclusion above.

For a prospective checkpoint, resolve the owner and frozen target refs, require the matching Workflow checkpoint transaction and checkpoint stage, and inspect the whole commit. Prove that the commit contains only the exact generated Workflow plan checkpoint owned by that transaction. Modified content, mixed commits, active skill behavior, runtime or source, tests, configuration, dependencies, unrelated paths, ambiguous ownership, missing ancestry, or any identity drift is ineligible and stops without tracker mutation. The transaction and invocation prove provenance only for that exact checkpoint; they never authorize another commit or path.

## Reuse or append the exact record

Read the exact owner's complete ordered tracker history. Contributions with the same owner, target, and classification may appear in one `direct_target_contribution:v1` record only when they belong to the same confirmed recovery packet; a prospective packet contains exactly its one checkpoint commit. Never create a mixed recovery and prospective grouping. Before the first write, validate the proposed record and its complete draft.

Reuse one exact matching record and return its immutable tracker identity without invoking the writer or creating a duplicate. More than one record for the same owner is allowed only for immutable disjoint checkpoint commit sets or other disjoint eligible contribution sets. Duplicate commit membership, partial overlap, conflicting purpose, mixed recovery and prospective grouping, malformed or edited history, multiple plausible records, unavailable history, or partial persistence stops without repair, supersession, or subset continuation. A malformed, duplicate, conflicting, mismatched, unavailable, or partially written record stops; never edit, delete, repair, or supersede a tracker comment.

Both routes append the same existing `direct_target_contribution:v1` fields, fixed classification, `attested_by: human`, and target-range-only statement. The route changes authority and provenance validation, not the record schema:

For each group, append exactly this record:

```text
direct_target_contribution:v1
owner: <Tracker Spec or Issue ID>
target: <Issue target branch>
classification: non-product-workflow-governance-maintenance
contributions:
  - commit: <full SHA>
    purpose: <human-confirmed purpose>
attested_by: human
statement: authorized for target-range coverage only
```

The record contains only `owner`, `target`, `classification`, ordered `contributions` entries with `commit` and `purpose`, `attested_by`, and `statement`. Tracker author and timestamp remain tracker-owned. `B`, `V`, paths, diff hashes, review or test results, and push readiness are absent.

Read the appended comment back once and require every field, value, order, and tracker location to match the caller's complete draft. A write or exact read-back failure is unresolved persistence: report any record that can be observed, stop, and never claim a missing group was attested.

Return the exact reused or appended immutable tracker identity to the active caller. The recovery caller discards its failed gate and owns starting fresh verification; the prospective caller owns its next publication or handoff stage.

The helper never creates commits or transactions, resumes a producer, publishes a Spec or decomposition, changes Issue state or labels, mutates Git or product files, creates a worktree, runs review or tests, starts Run, writes `push_ready`, pushes, remote-merges, or deploys.
