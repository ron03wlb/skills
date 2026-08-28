# Execute Issue #3 prerequisite runtime

**Goal:** Implement and verify the optional `pre-execute-issue` lifecycle and the read-only prerequisite gate in `execute-issue` as one reviewed Issue #3 candidate.
**Why planning is required:** This changes promoted public workflow contracts, tracker evidence, worktree ownership, and external-action safety across multiple user-invoked skills.
**Acceptance:** Keep target `features/ron` and Planning Seal `c6c87caf9337d5d28ea2a395751727093447cf08` unchanged; work only on topic branch `codex/issue-3-prerequisite-runtime` in `C:\tmp\skills-issue-3-prerequisite-runtime`; preserve all original target staged, unstaged, and untracked work; satisfy AC-1 through AC-6 without implementing `setup-pre-execute-issue` or performing SQL, database, consumer-repository, tracker-receipt, integration, closeout, push, or deployment actions; commit a clean candidate; run required focused, full, and manifest-review checks; repair confirmed Standards and Spec findings for at most ten waves; write and read back `implementation_complete` only when the reviewed candidate remains exact and clean. Any scope change, stale planning evidence, baseline failure, unresolved blocker, or unrecoverable verification/review failure records and reads back `implementation_blocked` before stopping.

### Outcome 1: Lock the prerequisite runtime contract test-first

- Work: Use `tests/ron-workflow/skill-contracts.test.mjs` as the public contract seam; add failing assertions for resolver discovery, status branches, worktree timing, bounded artifact repair, append-only receipts, READY freshness, execution gating, late discovery, user-only invocation, and prohibited automatic or external actions. Add the minimum `skills/engineering/pre-execute-issue/` contract and update `skills/engineering/execute-issue/` until those assertions pass.
- Risks/open questions: Generic skills must fail closed on declared resolver ambiguity without inventing a universal schema; the existing undeclared-resolver route must remain `NOT_REQUIRED`; runtime Issue execution must never invoke the new user-only skill.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 2: Synchronize promoted packaging and human routing

- Work: Add the `pre-execute-issue` docs page and synchronize `execute-issue`, `ask-matt`, the top-level and engineering READMEs, Codex metadata, and Claude plugin manifest in English, following `.agents/writing-docs.md` and `.agents/invocation.md`.
- Risks/open questions: Do not add `setup-pre-execute-issue`, bump release versions, introduce another resolver/config framework, or disturb unrelated manifest entries.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`, `git diff --check`, and the repository-required scoped `codex exec --ignore-user-config --ephemeral --sandbox read-only` manifest review.

### Outcome 3: Produce one trustworthy execution candidate

- Work: Commit the verified Issue paths, review `c6c87caf9337d5d28ea2a395751727093447cf08...HEAD` independently for Standards and Spec, repair only confirmed in-scope findings, rerun final verification, confirm the Issue worktree is clean and HEAD is the reviewed candidate, then publish and read back the completion note.
- Risks/open questions: Stop after ten material repair waves; never integrate, remove the worktree, close Issue #3, push, or deploy.
- Verify: `git status --short`, `git diff c6c87caf9337d5d28ea2a395751727093447cf08...HEAD --check`, focused and full Node test commands, and exact tracker completion-note read-back.
