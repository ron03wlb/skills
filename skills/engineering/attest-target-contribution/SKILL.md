---
name: attest-target-contribution
description: Append or reuse exact direct-target contribution authority evidence. Use when verify-target-before-push hands off a human-confirmed eligible coverage-recovery packet.
---

# Attest Target Contribution

Append or reuse the narrow tracker authority record for exact eligible Direct target contributions. This helper runs only from an active `verify-target-before-push` recovery after one exact human confirmation. It never decides push readiness or replaces Issue execution, closeout, review, or verification.

## Require the confirmed recovery packet

Require one exact confirmed recovery packet containing the owner Tracker Spec or Issue, Issue target branch, fixed `classification: non-product-workflow-governance-maintenance`, ordered full commit SHAs, per-commit purposes, and the complete tracker comment draft. Require evidence that the active verification workflow produced the packet only after its frozen selected-range coverage check found those commits uncovered and the human confirmed that exact draft once.

Read repository instructions and tracker configuration. Before mutation, re-read the exact owner and frozen refs, resolve every full SHA locally, inspect each whole commit diff, and revalidate that owner, target, commit, diff, eligibility, and ref identities still match the confirmed packet. Any owner, target, commit, diff, eligibility, or ref drift stops without writing or broadening the confirmation.

Eligibility is limited to explicit human-directed, non-product workflow or governance maintenance outside an Executable Issue by design, with one unambiguous owning Tracker Spec or Issue. Active skill behavior, runtime or source, tests, configuration, dependencies, migrations, security, data, public APIs, any mixed commit, partial-path attestation, owner ambiguity, or a non-coverage failure is ineligible and stops without tracker mutation.

## Reuse or append the exact record

Read the exact owner's ordered tracker history. Group only contributions with the same owner, target, and classification into one `direct_target_contribution:v1` record. Before the first write, validate every proposed group and its complete draft.

Reuse one exact matching record without invoking the writer or creating a duplicate. A malformed, duplicate, conflicting, mismatched, unavailable, or partially written record stops; never edit, delete, repair, or supersede a tracker comment.

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

Read the appended comment back once and require every field, value, order, and tracker location to match the confirmed draft. A write or exact read-back failure is unresolved persistence: report any record that can be observed, stop, and never claim a missing group was attested.

Return the exact reused or appended record identities to the active verification workflow. The helper does not resume the failed gate or start the fresh verification itself.

Never change Issue state or labels, mutate Git or product files, create a worktree, run review or tests, write `push_ready`, push, remote-merge, or deploy.
