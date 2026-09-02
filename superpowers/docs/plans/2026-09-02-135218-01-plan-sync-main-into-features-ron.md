# Sync Main into Features Ron

**Goal:** Integrate local `main@6654f6b60cd9d5be8b54c6fafe44346dabeb3b76` into local `features/ron@dc84d9a57b4e48c4c6be91cb358fe4a2ac7e3627` while preserving Ron contracts and accepted upstream updates.
**Why planning is required:** The merge changes public skill, packaging, routing, and validation contracts across 341 files and has 21 predicted conflicts.
**Acceptance:** Preserve both histories with a merge commit; keep the original `features/ron` and `main` commits as ancestors; preserve Ron Issue workflow, personal, batch, deprecated, and test contracts; absorb accepted upstream safety, skill, release, and documentation changes; pass every required verification; fast-forward only the unchanged local `features/ron`; do not push any remote ref. Stop if either source ref or the original checkout drifts, a baseline-only failure appears, or repair requires a new product decision.

### Outcome 1: Establish an attributable baseline
- Work: Use a fresh isolated worktree at the exact local `features/ron` commit and prove its current full Ron suite before merging.
- Verify: `node --test tests/ron-workflow/*.test.mjs`

### Outcome 2: Preserve both histories and resolve authority correctly
- Work: Merge the exact local `main` commit without rebase or squash. Use Ron-first authority for conflicts and Ron-owned contracts, retain non-conflicting upstream changes, absorb confirmed security and correctness fixes, and reconstruct composite manifests, router, README, ADR, and instruction surfaces semantically.
- Risks/open questions: An actual conflict or repository contract that contradicts the accepted design stops execution for a new decision.
- Verify: `git merge-base --is-ancestor main HEAD`

### Outcome 3: Produce the accepted skill and packaging surface
- Work: Preserve separate `grilling` and `batch-grill-me`; migrate `writing-great-skills` to `writing-for-agents`; keep `wizard` in progress; promote `to-questionnaire`; add promoted `wait-what`; retain Ron personal and deprecated skills; retain upstream `implement-spec` and `retro` as unpromoted drafts; use package and plugin version `1.2.3` with version synchronization; preserve Codex-native validation; do not adopt a repository-wide no-em-dash rule.
- Verify: `npm run check-plugin-version`

### Outcome 4: Prove behavioral and packaging compatibility
- Work: Run focused and full Ron tests, inspect conflict markers and whitespace, run the repository-required scoped Codex packaging review, and repair only merge-induced findings within the accepted design.
- Verify: `node --test tests/ron-workflow/*.test.mjs`

### Outcome 5: Deliver only the verified local integration
- Work: Review the complete candidate against both parents, verify the original checkout still points to the frozen `features/ron` commit, then fast-forward local `features/ron` without pushing.
- Risks/open questions: Any local target drift stops delivery; no automatic merge, rebase, reset, or push is permitted.
- Verify: `git merge-base --is-ancestor main features/ron`
