# Execute skills Issue #4

**Goal:** Implement the promoted user-invoked `setup-pre-execute-issue` contract as the minimal atomic adoption workflow defined by Issue #4, without modifying any consumer repository or runtime prerequisite behavior.
**Why planning is required:** This changes a public workflow contract that governs repository instructions, prerequisite tooling, validation, and strict external-state boundaries across consumer repositories.
**Acceptance:** Work only in a dedicated Issue worktree from `features/ron@808a105334fd6fea44c698adf70ff26b4af29e16`; reuse Planning Seal `c6c87caf9337d5d28ea2a395751727093447cf08`; preserve all target dirty/untracked state. Entry prerequisite result is `NOT_REQUIRED` because repository instructions declare no resolver. Add one English user-only promoted skill whose no-concrete-need path makes no changes, whose adoption surface is minimum and complete, and whose validation failure leaves no active/partial/TODO contract. Synchronize docs/router/READMEs/manifest/tests without changing #3 runtime semantics. Required focused/full verification, manifest packaging review, and independent Standards/Spec review must be clean; candidate worktree and reviewed `HEAD` must match before a read-back `implementation_complete` note. Stop without integration, worktree removal, Issue closure, push, deployment, consumer mutation, SQL/database/external action, runtime invocation, or Issue/receipt mutation beyond the terminal completion state.

### Outcome 1: Lock the public adoption contract with a failing test
- Work: Extend `tests/ron-workflow/skill-contracts.test.mjs` at the published contract seam for applicability/no-op, minimal complete adoption, exact `discover`/`prepare`/`verify` semantics, atomic validation rollback, unrelated-work preservation, authority exclusions, user-only metadata, and promoted parity.
- Verify: `node --test --test-name-pattern="one-time prerequisite resolver adoption" tests/ron-workflow/skill-contracts.test.mjs` fails because the new public skill does not yet exist.

### Outcome 2: Add the minimum complete setup skill
- Work: Create `skills/engineering/setup-pre-execute-issue/SKILL.md` and `agents/openai.yaml`. Reuse the finalized repository-owned resolver vocabulary from #3 and ADR 0035; define evidence-driven no-op, minimum existing instruction/policy/resolver/fixture adoption, safe local validation, complete-or-no-active-adoption failure behavior, and strict runtime/external-state exclusions. Add no script, resolver framework, configuration schema, dependency, or consumer-specific implementation.
- Verify: The focused contract test passes and the skill metadata is user-invoked in both harnesses.

### Outcome 3: Synchronize the promoted route
- Work: Add `docs/engineering/setup-pre-execute-issue.md`; update `skills/engineering/ask-matt/SKILL.md`, `docs/engineering/ask-matt.md`, top/bucket READMEs, and `.claude-plugin/plugin.json` with the explicit one-time setup route and no-op/runtime boundaries.
- Verify: Focused setup/router/parity tests pass; published docs use the required frame and absolute links.

### Outcome 4: Produce a clean reviewed candidate
- Work: Run focused and repository full verification, `git diff --check`, Node syntax check, and the required read-only manifest packaging review; commit only the Issue worktree candidate; run independent Standards and Spec review and repair confirmed in-scope findings for at most ten waves.
- Verify: Final candidate `HEAD` equals the reviewed SHA, worktree is clean, both review axes are clean, focused/full suites pass, original target candidate paths remain untouched, and Issue #4 reads back one final `implementation_complete` note.
