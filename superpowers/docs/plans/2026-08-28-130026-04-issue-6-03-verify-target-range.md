## Parent

#6

## Decomposition key

`#6/03`

## What to build

Make `/verify-target-before-push` verify one exact local-ahead or explicit already-pushed target range by mapping completion-note contributions to Issues and running aggregate review and verification without closeout receipts.

Expected touchpoints below are source-grounded starting points, not an allowlist.

## Acceptance Criteria

- **AC-1 - Exact evidence modes:** The command freezes exact baseline `B` and target `V`. Default local-ahead mode requires one unique configured upstream tracking tip, a non-empty range from that tip to local target `HEAD`, and no guessed baseline. Already-pushed work requires an explicit merge request, pull request, or exact base/head range.
- **AC-2 - Completion-note membership:** Read-back completion notes are the sole Issue-to-commit mapping authority. Candidates reachable from `V` but not `B` are members and require closed Issues; open unreachable candidates remain concurrent work outside the range. Closed unreachable candidates, reachable open members, missing identities, or superseding blocked states stop as contradictory delivery evidence.
- **AC-3 - Complete selected-range coverage:** Every material commit in the selected range is explained by at least one member baseline-to-candidate contribution, a referenced Planning Seal or prerequisite, or necessary merge topology. Contribution ranges may overlap and require no unique owner. Commit-message Issue numbers, merge-message parsing, closeout receipts, and manually repeated Issue lists are never mapping authority.
- **AC-4 - Aggregate exact-target gate:** Both modes run aggregate Standards review, every member Issue and linked or parent Spec review, deduplicated focused verification from completion notes, and the repository-required full suite once on exact `V` in a clean verification worktree. Any review, verification, identity, coverage, or cleanliness failure stops without product repair.
- **AC-5 - Honest result separation:** Only local-ahead mode may write and read back a `push_ready` result bound to exact `V`, `B`, member Issues, candidates, and verification evidence. Explicit already-pushed mode returns only a range or merge-request verification result and never retroactively emits `push_ready`. Neither mode pushes, changes product code, closes or reopens Issues, mutates other tracker state, remote-merges, or deploys.
- **AC-6 - Promoted contract parity:** The two-mode range, membership, coverage, aggregate gate, and result semantics are synchronized across the promoted skill, Codex metadata, human docs, router and README descriptions where affected, and contract tests in English, with no new public command or external dependency.

## Implementation Plan

### Step 1: Define exact range and membership semantics

Rewrite `skills/engineering/verify-target-before-push/SKILL.md` to select local-ahead or explicit already-pushed evidence, freeze `B` and `V`, derive membership from latest valid completion notes, classify open and closed candidates by ancestry, and fail closed on contradictory evidence. **Covers: AC-1, AC-2.**

### Step 2: Cover every commit and run one aggregate gate

Replace closeout-receipt discovery with many-to-many contribution coverage for every material selected-range commit, then define aggregate Standards and multi-Spec review, deduplicated focused checks, one full suite on exact `V`, clean verification-worktree requirements, and strict no-repair behavior. **Covers: AC-2, AC-3, AC-4.**

### Step 3: Separate results and synchronize promoted surfaces

Limit `push_ready` to local-ahead mode, define the already-pushed range result, and re-sync `docs/engineering/verify-target-before-push.md`, `skills/engineering/verify-target-before-push/agents/openai.yaml`, `skills/engineering/ask-matt/SKILL.md`, `docs/engineering/ask-matt.md`, affected README descriptions, and `tests/ron-workflow/skill-contracts.test.mjs`. **Covers: AC-1, AC-4, AC-5, AC-6.**

## Verification

- `node --test tests/ron-workflow/skill-contracts.test.mjs` passes local-ahead, explicit MR/PR and base/head, guessed or empty range rejection, ancestry membership, contradictory state, overlapping contribution coverage, unexplained commit, aggregate review and test failure, and result-separation cases. **Covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6.**
- `node --test tests/ron-workflow/*.test.mjs` passes the repository's complete Node test suite on the candidate. **Covers: AC-4, AC-6.**
- `node --check tests/ron-workflow/skill-contracts.test.mjs` and `git diff --check` pass, and source inspection finds no closeout-receipt or commit-message identity dependency in the active verification contract. **Covers: AC-3, AC-5, AC-6.**

## Exclusions

- Child reconciliation, decomposition-record publication, execution-attempt semantics, local integration, worktree cleanup, or Issue and parent closure.
- A new public verification command, guessed post-push baseline, unique commit ownership, aggregate repair loop, external dependency, queue, daemon, lock, push, remote merge, or deployment.

## Blocked by

#8

## Planning baseline

- Commit: f7c8a85ef8f3ad9aa7c0ff6a7f500497e5601446
- Seal: reused

## Target

features/ron
