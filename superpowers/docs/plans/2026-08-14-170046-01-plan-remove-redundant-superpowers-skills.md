# Remove redundant standalone Superpowers skills

**Goal:** Remove `writing-skills`, `systematic-debugging`, and `test-driven-development` from active Codex skill roots while keeping a recoverable quarantine.
**Why planning is required:** This changes external local Codex configuration and removes active junctions and skill directories.
**Acceptance:** The three names are absent from `C:\Users\ron.chang\.agents\skills` and `C:\Users\ron.chang\.codex\skills`; their original contents and hashes exist under `C:\Users\ron.chang\.codex\removed-skills\2026-08-14-170046-superpowers-first-batch`; the remaining ten standalone Superpowers skills and unrelated working-tree files are unchanged. Stop before mutation if a target is not the expected ordinary directory or junction, the quarantine already exists, or an unexpected external reference is found. Recovery is to move each quarantined directory back to `C:\Users\ron.chang\.codex\skills` and recreate its `C:\Users\ron.chang\.agents\skills` junction.

### Outcome 1: Exact removal scope is safe and recoverable
- Work: Verify the three source directories, their `SKILL.md` hashes, the three Agents junction targets, the absent quarantine path, and references from active configuration.
- Risks/open questions: Broken junctions or moving an unexpected directory; stop on any identity mismatch.
- Verify: `Get-Item`, `Get-FileHash`, and scoped `rg` checks for the three exact names.

### Outcome 2: First-batch skills leave active roots
- Work: Remove only the three verified Agents junction entries, create the dedicated quarantine, and move only the three verified Codex skill directories into it.
- Risks/open questions: Partial completion; preserve the exact state and recover from quarantine rather than deleting data.
- Verify: Read back active roots and quarantine targets after every move.

### Outcome 3: Final state preserves all non-target skills
- Work: Compare the remaining standalone Superpowers inventory, quarantine hashes, repository diff, and working-tree status with the preflight snapshot.
- Verify: Confirm zero active target names, three matching quarantined hashes, ten preserved standalone skills, `git diff --check`, and scoped `git status`.
