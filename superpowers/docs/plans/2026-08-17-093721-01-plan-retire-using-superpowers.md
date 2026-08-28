# Retire using-superpowers after preserving global risk routing

**Goal:** Preserve the current four-tier work-risk contract in global Codex instructions, then remove the redundant standalone `using-superpowers` skill from active local roots.
**Why planning is required:** This changes consequential global Codex behavior and destructively removes an active external skill directory and junction.
**Acceptance:** `C:\Users\ron.chang\.codex\AGENTS.md` contains one exact, readable four-tier classification with the High-risk durable-plan and evidence-gate requirements; `using-superpowers` is absent from both active roots; its original content is recoverable from a dedicated quarantine with the original SHA-256; all other standalone Superpowers skills and unrelated workspace files remain unchanged. Stop before mutation on any path, link, hash, duplicate-section, or quarantine mismatch. Recovery restores the original AGENTS file from its quarantined backup, moves the skill directory back, and recreates the Agents junction.

### Outcome 1: Global instructions own the risk contract
- Work: Add the current Router classification and authority safeguards to global `AGENTS.md` without changing unrelated instructions.
- Risks/open questions: Duplicate or divergent policy could over-trigger routine work or weaken High-risk handling.
- Verify: Compare the inserted section with the current `using-superpowers` contract, inspect the exact AGENTS diff, and confirm UTF-8 readability.

### Outcome 2: The standalone router leaves active roots recoverably
- Work: Verify identities and hashes, back up the pre-change AGENTS file, remove only the exact Agents junction, and move only the ordinary `using-superpowers` directory into the dedicated quarantine.
- Risks/open questions: Broken junction or partial external mutation; rollback immediately on any postcondition failure.
- Verify: Read back active-root absence, quarantine inventory and hashes, and the unchanged eight-skill non-target inventory.

### Outcome 3: Completion claims match final state
- Work: Compare global behavior, external filesystem state, and workspace state with acceptance.
- Verify: Run the claim-to-evidence gate, `git diff --check`, and `git status --short --branch`; do not commit or push.

## Completion evidence

- Status: Complete on 2026-08-17; no commit or push performed.
- Global contract: `C:\Users\ron.chang\.codex\AGENTS.md` contains exactly one four-tier risk section and has SHA-256 `47A85BD0EC7558A5DA0218576EA4671029212932A23CF1695D97F351CA7FA13C`.
- Removal: `using-superpowers` is absent from both active roots. Its quarantined `SKILL.md` retains SHA-256 `CEB55AD037852C6CDA487261382F4972869669396A2366678DF9CD84C39ED8DA`.
- Recovery: the pre-change global AGENTS backup retains SHA-256 `CE3E1998FAF2D5A2DF11F584ECEAE8FCDC2A84C372835ED7971F5BFB4EEC815A` under `C:\Users\ron.chang\.codex\removed-skills\2026-08-17-093721-using-superpowers`.
- Preservation: all eight non-target standalone Superpowers skills remain present in both active roots; existing tracked and untracked workspace changes were preserved; `git diff --check` passed.
