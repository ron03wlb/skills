## Parent

#6

## Decomposition key

`#6/01`

## What to build

Make `/to-tickets` re-entrant by reconciling one stable child decomposition and publishing one minimal parent completeness record after all child and blocker evidence matches.

Expected touchpoints below are source-grounded starting points, not an allowlist.

## Acceptance Criteria

- **AC-1 - Stable child identity:** Every child has one immutable `<Spec-ID>/<NN>` decomposition key that resolves its parent, while tracker Issue IDs remain the public execution and closeout inputs and titles are never identity.
- **AC-2 - Deterministic reconciliation:** For each expected key, `/to-tickets` creates no child when exactly one matching Issue exists, creates one child when none exists, and stops without mutation or automatic repair on duplicate keys or conflicting parent, target, Planning Seal, executable contract, body, or tracker-native relationship evidence. All tracker-supported identity sources must agree.
- **AC-3 - Bounded dependency model:** Owned blocker edges form an acyclic graph and are rendered through one canonical child contract plus tracker-specific native relations. A readable external Issue may block a child, but `/to-tickets` never creates, edits, closes, or assumes ownership of it.
- **AC-4 - Recoverable publication record:** Only after every expected child and blocker edge passes read-back, `/to-tickets` writes and reads back one minimal versioned decomposition publication record binding parent, Planning Seal, target, key-to-Issue mapping, and blocker edges. A failure before or during record publication remains recoverable partial publication by key, and retry reuses a verified successor seal rather than falling back to the inherited seal.
- **AC-5 - Exact ready frontier:** `ready-for-agent` and emitted `/execute-issue <Issue-ID>` commands apply only to open dependency-ready children. Blocked children receive neither, and matching reconciliation requires no per-child authorization.
- **AC-6 - Bootstrap and promoted parity:** The implementation is synchronized across the promoted skill, Codex metadata, human docs, router text, README descriptions where affected, and contract tests in English. The first delivery can rerun `/to-tickets #6` to reconcile these same `#6/01` through `#6/03` children and publish the current parent record without duplication.

## Implementation Plan

### Step 1: Define stable reconciliation and recovery

Update `skills/engineering/to-tickets/SKILL.md` and its child templates to make decomposition keys, all-source identity agreement, zero/one/many reconciliation, owned and external blockers, partial-publication recovery, successor-seal reuse, canonical rendering, and fail-closed behavior explicit. **Covers: AC-1, AC-2, AC-3, AC-4.**

### Step 2: Publish one complete record and frontier

Define the minimal versioned parent publication record, its all-children/all-edges read-back gate, exact dependency-ready label and command behavior, and the Spec #6 bootstrap rerun. **Covers: AC-4, AC-5, AC-6.**

### Step 3: Synchronize promoted documentation and tests

Re-sync `docs/engineering/to-tickets.md`, `skills/engineering/to-tickets/agents/openai.yaml`, `skills/engineering/ask-matt/SKILL.md`, `docs/engineering/ask-matt.md`, affected README descriptions, and `tests/ron-workflow/skill-contracts.test.mjs` so the re-entrant contract, identity sources, native relations, record, and frontier remain consistent. **Covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6.**

## Verification

- `node --test tests/ron-workflow/skill-contracts.test.mjs` passes cases for stable keys, zero/one/many reconciliation, conflicting identity sources, acyclic owned blockers, read-only external blockers, partial publication, successor-seal recovery, record read-back, bootstrap reuse, and exact frontier labels and commands. **Covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6.**
- `node --check tests/ron-workflow/skill-contracts.test.mjs` passes. **Covers: AC-6.**
- `git diff --check` reports no whitespace errors in the candidate, and final status proves unrelated target work was preserved. **Covers: AC-6.**

## Exclusions

- Implementing execution, closeout, or aggregate target verification behavior owned by `#6/02` and `#6/03`.
- Creating a tracker-independent database, dependency engine, generic receipt framework, queue, daemon, or lock service.
- Automatically repairing conflicting tracker evidence, closing any Issue, pushing, remote merging, or deploying.

## Blocked by

None.

## Planning baseline

- Commit: f7c8a85ef8f3ad9aa7c0ff6a7f500497e5601446
- Seal: reused

## Target

features/ron
