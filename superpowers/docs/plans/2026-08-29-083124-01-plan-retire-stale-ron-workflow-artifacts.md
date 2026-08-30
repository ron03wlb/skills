# Retire stale Ron workflow artifacts

**Goal:** Align the active ADR set with the current manual-attestation workflow and remove only the obsolete local Junction and stale untracked consolidation plan.
**Why planning is required:** The task permanently removes one untracked file and one user-level Junction outside the repository.
**Acceptance:** Mark ADR-0024 through ADR-0035 as superseded by ADR-0039 and make ADR-0039 state that complete range; remove only `C:\Users\ron.chang\.agents\skills\setup-pre-execute-issue` and `superpowers/docs/plans/2026-08-28-171534-01-plan-consolidate-ron-workflow-skills.md`; preserve the Junction target, all `skills/**/SKILL.md` files, every other user-level skill entry, unrelated repository state, branches, commits, and remotes. Before deletion, require the plan to be an ordinary untracked file with SHA-256 `E2C6748BE7E7950A596F64D91474AB39013A7E8F953757FC55AEB14566C1B5B9` and the Junction to resolve exactly to `C:\Workspace\open_source\skills\skills\engineering\setup-pre-execute-issue`, whose `SKILL.md` is absent. Stop on any identity, type, hash, target, or scope mismatch. Recovery for the Junction is recreation against its recorded target; the stale untracked plan is intentionally retired and can be reconstructed only from the task's pre-delete read-back.

### Outcome 1: The active ADR set matches the current workflow
- Work: Change only ADR-0024 through ADR-0035 status metadata to `superseded by ADR-0039`, and update ADR-0039 to state that it supersedes the complete range.
- Verify: Inspect all ADR status metadata, the scoped diff, and the current prerequisite skill contracts.

### Outcome 2: Only the approved stale artifacts are removed
- Work: Remove the exact obsolete user-level Junction without traversing or deleting its target, then delete the exact stale untracked plan.
- Risks/open questions: The plan is not tracked by Git and its deletion is permanent; no other user-level skill entry is in scope.
- Verify: Read back both source and target paths, inventory sibling skill entries, and confirm the Junction target still exists unchanged.

### Outcome 3: Skill behavior and unrelated state are unchanged
- Work: Make no change under any `skills/**/SKILL.md` or skill metadata path.
- Verify: Recompute the 50-file skill manifest `33A6C220178FB10D49D334660243A47818AA697B84C3ADBAED5ECAF8E161AA57`, run `node --test tests/ron-workflow/skill-contracts.test.mjs`, run `git diff --check`, and inspect final `git status --short --untracked-files=all`.
