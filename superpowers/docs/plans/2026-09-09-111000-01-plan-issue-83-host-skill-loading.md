# Issue 83: Host-compatible skill loading

**Goal:** Implement Issue #83 under parent Spec #80 while preserving invocation, selected-source, planning-lane, and explicit publication boundaries.
**Why planning is required:** High-risk public instruction contract governing dependency invocation and source authority.
**Acceptance:** AC-1 through AC-4 from Issue #83; independent Standards and Spec review; a clean committed candidate with required verification and one read-back `implementation_complete`. Integration, cleanup, closure, push, and deployment remain with their later owners.

Execution baseline and Planning Seal: `4d40439f1f50578b0d7ad836b044814c6b012022` (`reused`). Target: `features/ron` at `C:/Workspace/open_source/skills`. Sole Issue lane: `C:/Users/ron.chang/.codex/worktrees/647f/skills`, branch `codex/issue-83-host-skill-loading`, task `01a0841b-af00-77a3-bff5-c1c702fc2e11`. Run Grant and child body digest were read back and matched before mutation. No Manual prerequisites or blockers exist.

### Outcome 1: Permitted dependencies load through the available host
- Work: Keep the shared convention in `.agents/invocation.md`; distinguish authorization and selected source from mechanism. Preserve one named skill per invocation, explicit-only metadata pairing, pinned Matt/Ron owners and references, and host-catalog generic helpers. Update only the affected operative `grill-with-docs` instruction.
- Verify: Focused structural assertions in `node --test tests/ron-workflow/skill-contracts.test.mjs`; bounded loading scenarios for tool availability, inaccessible content, explicit-only targets, source conflicts, and immutable packages.

### Outcome 2: Planning descriptions agree with their existing owner
- Work: Align `grill-with-docs` UI metadata and human docs. Read-only/tracker-only planning needs no worktree; accepted glossary/ADR writes use the same registered isolated lane. Preserve the one-material-decision rule, exact handoff packet, later explicit `/to-spec`, and preservation/cleanup conditions. Inspect router/catalog text and change only contradictory wording.
- Verify: Focused structural assertions plus `node --test tests/ron-workflow/planning-entry.test.mjs` for existing lane harness coverage. Inspect the final diff and UTF-8 without BOM.

### Outcome 3: Reviewable, accurately reported evidence
- Work: Commit the candidate; run the repository suite through the pinned execution verification cache and obtain separate independent Standards and Spec reviews. Repair confirmed in-scope findings within the existing cumulative budget. Declare this required non-contract plan as the sole workflow artifact. Use all Matt/Ron workflow owners and references from Run package `852bd245fbd94b8a7a815de4a52e036cfa691f97c1169fddff6e604ef53ea90f`; use current host catalog entries for generic helpers.
- Verify: `node --test tests/ron-workflow/*.test.mjs` and `npm run check-plugin-version`. No typecheck is configured in `package.json`. Report structural assertions, harness fixtures, observed model behavior and unrun model cases separately; make no token, cost, latency, or interruption claims. Freshly validate cache inputs before the completion note and read that note back.
