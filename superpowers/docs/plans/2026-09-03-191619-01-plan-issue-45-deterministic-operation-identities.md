# Issue 45 Deterministic Workflow Operation Identities Plan

## Scope and authority

- Issue: GitHub `ron03wlb/skills#45`, decomposition key `43/03` under Spec `#43`.
- Target: `features/ron` at execution baseline `3d58043a24441a97225489c81c0cc058a5b9dd0a`.
- Planning Seal: `2fa07aeb290efe792c5f2c308461903e9302b7e3` (`created`), verified as an ancestor of the execution baseline.
- Delivery boundary: implement, review, verify, commit, and publish one `implementation_complete` note. Do not integrate the target, remove the Issue worktree, close the Issue, push, or deploy.

## Assumptions

- `github:ron03wlb/skills` is the repository adapter's canonical repository identity; the identity module validates and hashes this owner-supplied value but does not rediscover remotes.
- The existing `approvedScopeIdentity` / `approvedScopeHash` is the immutable approved publication hash used to distinguish revisions.
- Existing checkpoint and Run records without the new versioned operation receipt are compatibility evidence. They remain readable and resumable, while newly created current-profile operations must bind the deterministic receipt.
- `to-spec` primary reservation is the only pre-Spec bootstrap. It derives from the proposed-Spec identity and is replaced by a Spec-bound publication operation after tracker read-back.

## Success criteria

1. One owner-local module returns a canonical, versioned, secret-free receipt and key from repository, Spec, approved publication, producer, stage, and Issue when required; identical inputs produce the same key and every material identity change produces a different key.
2. Fresh `to-spec@v2` and `to-tickets@v2` checkpoint transactions must bind a matching receipt, while stored current receipts and frozen legacy/profile-v1 operations retain exact read/resume behavior.
3. Fresh Run selection derives its `runId` from the same receipt instead of caller correlation; selected stored Runs retain their recorded identity for compatibility.
4. Public and owner-local contracts assign one semantic owner to each of `to-spec`, `to-tickets`, `run-issue-workflow`, `execute-issue`, `close-issue`, and `verify-target-before-push`, with downstream checks limited to receipt identity/hash/freshness and current mutation preconditions.
5. Focused identity/ownership tests, the three affected test files, the full Ron workflow suite, `git diff --check`, and two-axis review are clean.

## Implementation sequence

1. Add failing identity/store tests for deterministic retry, cross-Spec/Issue/revision/repository isolation, reservation bootstrap, malformed receipts, and stored-receipt compatibility. Run the Issue pattern and confirm the failure is the missing contract.
2. Implement `workflow-operation-identity.mjs`; make fresh current checkpoint creation consume its receipt without changing read/advance validation for stored legacy state. Run focused core tests to green and commit this slice.
3. Add a failing runtime seam test proving a fresh Run ignores caller correlation and binds the derived key while a recorded Run resumes its stored identity. Route `run-authority-adapters.mjs` through the module and run focused end-to-end tests to green.
4. Add failing contract assertions, then update owner-local references, affected Skill entry text, human docs/metadata, and `CONTEXT.md` terminology. Keep upstream semantic work with its owner and document fail-closed compatibility.
5. Run the Issue-specified pattern, all three affected test files, the full `tests/ron-workflow` suite, and `git diff --check`; inspect the final diff and commit a clean candidate.
6. Freeze the candidate commit and run parallel Standards and Spec review. Repair confirmed findings within the shared ten-wave budget, rerun both review axes and all verification after each material repair, then post and read back the exact `implementation_complete` note with this plan recorded as `workflowArtifacts`.

## Verification commands

```text
rtk node --test --test-name-pattern="operation identity|same-command|duplicate|different Spec|different Issue|approved revision|receipt owner" tests/ron-workflow/run-issue-workflow-core.test.mjs tests/ron-workflow/run-issue-workflow-end-to-end.test.mjs tests/ron-workflow/skill-contracts.test.mjs
rtk node --test tests/ron-workflow/run-issue-workflow-core.test.mjs tests/ron-workflow/run-issue-workflow-end-to-end.test.mjs tests/ron-workflow/skill-contracts.test.mjs
rtk node --test tests/ron-workflow/*.test.mjs
rtk git diff --check
rtk git status --porcelain
```

## Recovery boundaries

- A missing, duplicate, mismatched, out-of-order, or ambiguous receipt stops before mutation. Do not migrate, overwrite, delete, or attribute it to another operation.
- A red test caused by environment or tooling is reported separately and does not consume a repair wave.
- Preserve unrelated branches, worktrees, tracker records, receipts, and files. All edits and commits remain confined to this Issue worktree and topic branch.
