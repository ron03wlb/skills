# Consolidate requesting-code-review into code-review

**Goal:** Preserve automatic independent review for material security, data, concurrency, migration, contract, and cross-module risk in the promoted `code-review` skill, then remove the redundant standalone `requesting-code-review` skill from active local roots.
**Why planning is required:** This changes a promoted public skill contract and destructively changes external local Codex configuration.
**Acceptance:** `code-review` keeps its fixed-point Standards/Spec workflow while its invocation contract covers the six named risk classes; `SKILL.md`, Codex metadata, docs, READMEs, router, and tests agree; active local `code-review` paths resolve to this repository; `requesting-code-review` and the replaced local `code-review` copy are recoverable from a dedicated quarantine; unrelated files and skills remain unchanged. Stop before local mutation on any path, link, hash, or reference mismatch.

### Outcome 1: One canonical review activation contract
- Work: Update the promoted `code-review` description and all public routing/documentation surfaces without changing its review mechanics.
- Risks/open questions: Over-triggering routine changes or implying that review can proceed without a fixed point; retain the existing entry gate.
- Verify: Inspect exact description parity and the resulting focused diff.

### Outcome 2: Packaging and regression contracts stay synchronized
- Work: Update Codex UI metadata and focused contract assertions for the retained high-risk activation behavior.
- Verify: Run repository skill-contract tests, relevant metadata checks, and `git diff --check`.

### Outcome 3: Local runtime uses the canonical skill
- Work: Verify local path identities and hashes; quarantine the ordinary `C:\Users\ron.chang\.codex\skills\code-review` copy and `requesting-code-review`; replace active `code-review` entries with junctions to `C:\Workspace\open_source\skills\skills\engineering\code-review`; remove the requesting-code-review Agents junction.
- Risks/open questions: Broken junctions or moving an unexpected directory; preserve exact quarantined contents for recovery.
- Verify: Read back both active roots, junction targets, quarantine hashes, and non-target skill inventory.

### Outcome 4: Completion claims match final evidence
- Work: Compare the final diff and active local state with acceptance, preserving all unrelated untracked files.
- Verify: Run focused tests, `git diff --check`, `git status --short --branch`, and the destructive-operation evidence gate.

## Completion evidence

- Status: Complete on 2026-08-14; no commit or push performed.
- Repository: 8 scoped files changed; `git diff --check` passed; Ron workflow contract tests passed 10/10.
- Skill validation: built-in `quick_validate.py` passed under Python UTF-8 mode; the first CP950 run was an environment decoding failure, not a skill validation failure.
- Local runtime: both active `code-review` junctions target `C:\Workspace\open_source\skills\skills\engineering\code-review` and match repository SHA-256 `E4477CF4D0B67913B2416B004BE6768FC60449D657763454515937F94E869F33`.
- Removal: `requesting-code-review` is absent from both active roots. The old local `code-review` copy and `requesting-code-review` are recoverable under `C:\Users\ron.chang\.codex\removed-skills\2026-08-14-183646-requesting-code-review-consolidation`, with SHA-256 values `6A65CC61114F96DB07EC41E3920E67C9C5BF70DD6E0901EB9460EBCB2BDC209F` and `1DF101F11905B9A7892425621F3BE737F05DD6D82AC5671A9CEC8EDADE9BC887` respectively.
- Preservation: all nine non-target standalone Superpowers skills remain present in both active roots; pre-existing unrelated untracked plans were left untouched.
