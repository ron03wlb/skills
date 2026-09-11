# Clean redundant run-issue-workflow entries

**Goal:** Leave one logical current `run-issue-workflow` package exposed through the two required Codex skill roots, with no backup entries in discovery paths.
**Why planning is required:** The operation removes Junction entries and replaces one active external skill link.
**Acceptance:** Before execution, every target path is an exact direct child of an approved skill root, every removable target is a Junction to a retained workflow package, the catalog current version and both active-link targets match the recorded inventory, and all package manifests pass SHA-256 verification. Stop on any drift. After execution, `.codex/skills` and `.agents/skills` each contain only the canonical `run-issue-workflow` entry, both point to catalog version `f7461e593e0fa7aaf14315acdfb5a16d7ad41cd77cbc130d0419113ac5477d58`, all 17 immutable package directories and installation metadata remain unchanged, and the repository worktree preserves all pre-existing state. Because direct Junction deletion is blocked by host policy, relocate the old entries atomically to a dedicated quarantine outside all skill discovery roots. Recovery remains possible by moving the recorded Junctions back; the prior `.agents` target is version `9f2ae5945c71526e9508e67a009ea9f47ed68bf0a2f7b5b16fceac9dd35de6c0`.

### Outcome 1: Remove backup entries from skill discovery
- Work: Move only the four inventoried `.codex/skills/run-issue-workflow.before-*` Junctions to the dedicated quarantine. Do not remove their target package directories or installation backups.
- Verify: Enumerate `run-issue-workflow*` directly under `.codex/skills` and confirm only `run-issue-workflow` remains.

### Outcome 2: Align the Codex-compatible active entry
- Work: Move `.agents/skills/run-issue-workflow`, whose approved old target is version `9f2ae5945c71526e9508e67a009ea9f47ed68bf0a2f7b5b16fceac9dd35de6c0`, to the dedicated quarantine, then create the canonical Junction to the catalog current version. Roll the old Junction back if creation fails.
- Verify: Read both active Junction targets and confirm they exactly match the catalog current package path.

### Outcome 3: Prove preservation and package integrity
- Work: Preserve `.claude/skills`, all immutable workflow packages, the installation catalog, installation backups, unrelated skills, and repository source.
- Verify: Recount package directories and backups, hash the installation catalog and every file named in the retained current package manifest, inspect the exact active-root inventory, and review `git status`.
