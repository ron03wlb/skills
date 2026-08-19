# Repair Planning Seal review findings

**Goal:** Repair the supported workflow-contract findings without widening the Planning Seal architecture.
**Why planning is required:** The change alters public skill invocation and review behavior across promoted workflow contracts.
**Acceptance:** WIP and committed review candidates are both visible from a fixed point; promoted docs satisfy their structural rules; README descriptions remain one line; deterministic contracts and the full local workflow test set pass; unrelated work remains untouched.

### Outcome 1: Make fixed-point review work for uncommitted candidates
- Work: Update `code-review` so committed candidates keep three-dot merge-base comparison, while WIP candidates include tracked staged/unstaged changes and explicitly scoped untracked files without absorbing unrelated dirt. Synchronize public docs and contract coverage.
- Risks/open questions: Candidate scope must remain explicit when the worktree contains unrelated changes.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 2: Restore promoted documentation structure
- Work: Keep `ask-matt` to two `What it does` paragraphs, keep `to-tickets` within three free-form middle sections, and fold the `code-review` activation text into one README description line.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 3: Preserve the minimal Planning Seal design
- Work: Keep the two mode-specific seal protocols local to `to-spec` and `to-tickets`; do not add a shared promoted skill for two callers. Retain contract assertions that cover their shared safety invariants and distinct primary/revision/successor rules.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs tests/ron-workflow/wiki.test.mjs`
