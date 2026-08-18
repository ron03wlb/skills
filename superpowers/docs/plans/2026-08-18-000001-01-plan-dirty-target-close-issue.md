# Allow close-issue to preserve unrelated target work

**Goal:** Let `close-issue` fast-forward and close a reviewed Issue without requiring the original target worktree to be globally clean.
**Why planning is required:** This changes a workflow contract that governs consequential local Git integration, worktree removal, and tracker closure.
**Acceptance:** The reviewed Issue worktree remains clean; pre-existing staged, unstaged, and untracked target state is allowed only when it has no exact or path-prefix collision with the candidate delta; target and dirty-state drift stop the invocation before integration; a read-back-verified `PREPARED` completion-note receipt binds the target-before SHA, candidate SHA, canonical dirty-snapshot digest, and non-sensitive counts before fast-forward; `VERIFIED` is recorded only after the target reaches the candidate and the digest still matches; cleanup and Issue closure require a matching `VERIFIED` receipt. Retry may recover a matching `PREPARED` receipt only when the target is still the recorded target-before or already equals the candidate and the digest matches; a missing, failed, mismatched, third-SHA, or unreadable receipt is ambiguous and stops. Snapshots and collision sets include both source and destination for candidate and dirty renames, use NUL-safe parsing and repository/filesystem case semantics, and never publish paths or file contents. Overlap or failure never triggers automatic stash, commit, cleanup, refresh, rollback, or product-code repair.

### Outcome 1: Define the path-aware closeout contract
- Work: Update `close-issue` so target cleanliness is replaced by an explicit dirty-state snapshot, candidate-delta collision check, target-scoped integration serialization, final preflight, two-phase completion-note preservation receipt, `--ff-only` integration, and post-integration preservation proof. Keep the candidate worktree clean and retain all existing cleanup, closure, and external-action exclusions.
- Risks/open questions: A same-path or path-prefix collision, target movement, dirty-state movement, tracker/read-back failure, or receipt mismatch is ambiguous and must leave the Issue open without touching user work. A `PREPARED` receipt is recoverable only through its exact recorded identities and digest; it is never replaced with the current state as a new baseline inside the same invocation.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 2: Re-sync the public workflow map and decision record
- Work: Update the promoted docs page, `ask-matt` skill/docs routing language, and ADR-0022 so they distinguish parallel Issue work from the short serialized integration section and distinguish candidate cleanliness from target preservation.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 3: Prove packaging, contract, and diff integrity
- Work: Add focused contract assertions for unrelated dirty-target allowance, two-phase receipt ordering and retry, overlap/drift stops, both sides of dirty and candidate renames, and cleanup/closure gating; then run the repository-required focused test and independent manifest/promoted-skill review. Inspect the final diff and working-tree state to ensure pre-existing changes were preserved.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`
- Verify: `codex exec --ignore-user-config --ephemeral --sandbox read-only "Review only the manifest and promoted-skill packaging contract; verify parity, paths, docs, and invocation metadata. Ignore unrelated working-tree files. Do not modify files or spawn subagents. Report only actionable findings."`
- Verify: `git diff --check`
