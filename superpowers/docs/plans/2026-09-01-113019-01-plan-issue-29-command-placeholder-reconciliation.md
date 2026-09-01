# Reconcile one historical command placeholder

**Goal:** Extend the existing closed-Issue reconciliation path so one human-confirmed historical command placeholder can map to the exact repository full-suite command without changing tracker history or weakening aggregate verification.
**Why planning is required:** This changes a promoted public workflow contract and the authority boundary for append-only tracker evidence.
**Acceptance:** Satisfy Issue #29 AC-1 through AC-5 on `codex/issue-29-command-placeholder`; preserve literal-command validation, immutable completion history, exact human confirmation, selected-range-only eligibility, fresh Entry, full-suite deduplication, both evidence modes, and every no-close/no-push/no-deploy boundary; commit a clean reviewed candidate and publish only the `execute-issue` completion evidence.

### Outcome 1: Prove the command-representation recovery contract
- Work: Add focused contract fixtures in `tests/ron-workflow/skill-contracts.test.mjs` for the sole-placeholder boundary, exact descendant command proof, frozen-target pass, exact confirmation, record reuse/read-back and drift, fresh Entry, both evidence modes, and fail-closed ambiguity cases.
- Risks/open questions: The fixture must distinguish a non-executable placeholder from the existing genuinely failing-command diagnostic path and must not encode a new public command.
- Verify: `node --test --test-name-pattern="command representation reconciliation|historical command placeholder|record-closed-issue-reconciliation|target verification" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 2: Extend verifier and helper authority without broadening it
- Work: Update `skills/engineering/verify-target-before-push/SKILL.md` and `skills/engineering/record-closed-issue-reconciliation/SKILL.md` so the verifier proves one exact placeholder mapping and the existing model-invoked helper revalidates and appends or reuses its exact affected-Issue record.
- Risks/open questions: Any prose normalization, multiple possible command, non-descendant evidence, current-only success, altered completion state, or record ambiguity must stop without mutation.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 3: Synchronize every promoted surface
- Work: Re-sync both skills' `agents/openai.yaml`, human docs, `skills/engineering/ask-matt/SKILL.md`, `docs/engineering/ask-matt.md`, and promoted README descriptions. Keep the existing helper model-invoked and add no plugin member or public command.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 4: Review and completion gate
- Work: Commit the exact Issue contribution, run independent Standards and Spec review from execution baseline `9a328c615652d0cb9a7bef0c476695a325515d1a`, repair confirmed in-scope findings within the ten-wave limit, rerun final verification, and publish/read back `implementation_complete` with the reviewed workflow-artifact declaration.
- Verify: `node --test tests/ron-workflow/*.test.mjs`; `git diff --check 9a328c615652d0cb9a7bef0c476695a325515d1a...HEAD`; clean worktree and exact reviewed `HEAD`
