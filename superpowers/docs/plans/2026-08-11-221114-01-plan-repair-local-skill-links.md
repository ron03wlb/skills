# Repair local skill links

**Goal:** Synchronize the repository-owned skills in the local Codex and Claude skill stores with the current repository while preserving recoverable copies of replaced entries.
**Why planning is required:** The repair replaces local directories and removes retired skill links from active stores, so it is destructive external-state work.
**Acceptance:** Every non-deprecated repository skill has a direct symlink from both `/Users/ron/.agents/skills` and `/Users/ron/.claude/skills`; retired links that point to removed repository skills are absent from both active stores; unrelated local skills remain untouched; every replaced entry is recoverable from a timestamped backup; duplicate repository skill names, unexpected destination roots, or backup collisions stop execution before mutation.

### Outcome 1: Verified repair scope and recovery point
- Work: Resolve the repository and destination roots, reject duplicate skill names or destination roots that link into the repository, enumerate only repository-owned targets and retired broken repository links, and prepare a new backup root under `/private/tmp`.
- Verify: A read-only preflight reports unique expected names, exact replacement/removal counts, no unexpected target classes, and an unused backup path.

### Outcome 2: Recoverable local-store synchronization
- Work: Move each conflicting repository-owned entry into the backup, create direct per-skill symlinks to the current repository, and move retired broken repository links out of the active stores. Do not touch unrelated names.
- Risks/open questions: `/private/tmp` backups are recoverable during this handoff but may be removed later by the operating system.
- Verify: Every expected target is a direct symlink resolving to its matching repository skill directory, and every retired target is absent from both active stores.

### Outcome 3: Post-repair integrity proof
- Work: Compare the final stores with the repository allowlist, confirm unrelated entry identities are unchanged, confirm the backup contains every replaced or removed entry, and inspect repository status for unintended changes.
- Verify: A post-repair audit reports zero missing, wrong, non-symlink, or retired repository targets and no repository change beyond this plan plus pre-existing user files.
