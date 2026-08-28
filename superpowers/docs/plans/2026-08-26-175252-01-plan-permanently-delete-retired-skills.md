# Permanently delete retired local skills

**Goal:** Permanently delete the five retired Superpowers skill directories that remain in local quarantine and verify that the five previously removed OpenSpec skills remain absent.
**Why planning is required:** This irreversibly removes local external configuration artifacts outside the repository.
**Acceptance:** Delete only `writing-skills`, `systematic-debugging`, `test-driven-development`, `requesting-code-review`, and `using-superpowers` below their named `C:\Users\ron.chang\.codex\removed-skills` quarantine directories. Preserve `code-review-local-copy`, `AGENTS.md.before-using-superpowers-retirement`, every active skill, and unrelated workspace files. The five OpenSpec names and five Superpowers names must be absent from both active roots after deletion. Stop before mutation if any target is missing, is a reparse point, resolves outside its expected quarantine parent, lacks `SKILL.md`, or contains an unexpected top-level entry. Permanent deletion has no local rollback; reinstall from the original source would be required.

### Outcome 1: The deletion manifest is exact and bounded
- Work: Inspect each named quarantine directory, resolved path, filesystem type, top-level inventory, and `SKILL.md`; confirm all ten retired skill names are absent from `C:\Users\ron.chang\.codex\skills` and `C:\Users\ron.chang\.agents\skills`.
- Risks/open questions: A path mismatch or unexpected entry could delete unrelated recovery material.
- Verify: PowerShell read-only identity, boundary, reparse-point, inventory, and active-root checks return one exact pass record per target.

### Outcome 2: Only the five retired Superpowers skill directories are permanently removed
- Work: Delete the five manifest paths with PowerShell `Remove-Item -LiteralPath`; remove the first-batch quarantine parent only if it is empty afterward.
- Risks/open questions: This removes the local recovery copies permanently.
- Verify: Each exact target path is absent; no broader quarantine parent is recursively removed.

### Outcome 3: Final state preserves retained skills and recovery artifacts
- Work: Recheck both active roots, all ten retired names, the eight retained standalone Superpowers skills, the two non-target recovery artifacts, repository status, and the durable plan.
- Verify: The retired-name count is zero, all eight retained skills exist in both roots, `code-review-local-copy` and the global AGENTS backup still exist, and `git diff --check` reports no whitespace errors for the new plan.
