# Issue 82: Attributable review requirements

**Goal:** Review explicitly designated requirements, including accepted conversation requirements, with honest Spec assessment and unchanged formal delivery gates.
**Why planning is required:** This changes the public code-review contract and independent reviewer inputs.
**Acceptance:** Issue #82 AC-1 through AC-5 and parent #80's applicable cross-Issue constraints; English instructions/docs/metadata, bounded evidence labeled by evidence type, clean independent Standards and Spec review, and a read-back completion note. No integration, closure, push, deployment, or sibling behavior changes.

## Execution identity

- Repository common directory: `C:/Workspace/open_source/skills/.git`
- Target / target worktree: `features/ron` / `C:/Workspace/open_source/skills`
- Sole Issue lane: `codex/issue-82-review-spec-provenance` / `C:/Users/ron.chang/.codex/worktrees/e6d8/skills`
- Baseline and reused Planning Seal: `4d40439f1f50578b0d7ad836b044814c6b012022`
- Issue operation: `workflow-op-v1-c714e7a826ea6ffde0178e947e192e88fd4a5545430efacefa51034cd87bde9d`
- Grant: `workflow-op-v1-5e41dc510b96e50a503ec758448a92148504e67dd6dbf97dd5606564442d66bf`, read from its Git-common-dir `grant.recorded` event; live parent and child body digests match publication and decomposition.
- Workflow owners: immutable package `852bd245fbd94b8a7a815de4a52e036cfa691f97c1169fddff6e604ef53ea90f`; generic plan and verification helpers use the current host catalog as allowed by parent #80.

### Outcome 1: Explicit sources and attributable reviewer input

- Work: Update `skills/engineering/code-review/SKILL.md` source selection, conditional tracker setup, frozen statements with provenance, both review modes, and missing-Spec reporting. Preserve the inspected `execute-issue` published-scope and completion gates. Covers AC-1 through AC-4.
- Verify: `node --test tests/ron-workflow/code-review-requirements.test.mjs`; inspect the owning execution contract and baseline diff.

### Outcome 2: Consistent public guidance and bounded evidence

- Work: Synchronize `docs/engineering/code-review.md` and code-review UI metadata. Inspect router/catalog wording and change only contradictions. Add structural regressions and bounded independent model scenarios for explicit conversation/file/Issue precedence, unavailable/conflicting requirements, provenance without inherited history, general review without a Spec, and formal delivery limitations. Covers AC-1 through AC-5.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`; record structural checks separately from observed model responses and unrun cases; inspect UTF-8 without BOM and docs conventions.

### Outcome 3: Verified committed candidate and execution receipt

- Work: Commit only this Issue's contribution, run required candidate-bound checks through the pinned execution verification cache, obtain independent Standards and Spec review, repair confirmed in-scope findings under the cumulative ten-wave budget, and append/read back exactly one `implementation_complete`. This plan is the sole prospective non-contract workflow artifact.
- Verify: `node --test tests/ron-workflow/*.test.mjs`, `npm run check-plugin-version`, `git diff --check`; no configured typecheck script or TypeScript configuration was found. Final fresh cache inputs, clean Issue lane at the reviewed candidate, and immutable tracker completion read-back are required. Stop at any unresolved authority, scope, or evidence mismatch while preserving the lane.
