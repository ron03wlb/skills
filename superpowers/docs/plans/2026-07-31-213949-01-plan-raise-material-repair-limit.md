# Raise Material Repair Limit To Ten

**Goal:** Raise the Ron `execute-issue` material repair ceiling from two waves to ten while preserving exact Grant authority, review invalidation, and checkpoint behavior.
**Why planning is required:** This changes a high-risk authorization contract used across Ron executable Issues.
**Acceptance:** The active execution skill and its canonical supporting policy consistently enforce an explicit Grant-bound limit from one through ten; existing Grants keep their recorded limits; an eleventh wave, missing or invalid limit, scope drift, or changed Spec/seam still stops; Wiki-only closeout repair remains capped at two.

### Outcome 1: Define the ten-wave execution contract
- Work: Update `CONTEXT.md` and `research/matt-first-issue-delivery-workflow-spec.md` so a material repair wave is bounded by the current Grant, the permitted range is one through ten, and the stop/acceptance scenarios reject work after the granted ceiling.
- Verify: `rtk rg -n "material repair|repair wave|third material|two material|ten material|eleventh" CONTEXT.md research/matt-first-issue-delivery-workflow-spec.md`

### Outcome 2: Make the active skill and operator guidance agree
- Work: Update `skills/engineering/execute-issue/SKILL.md`, `docs/engineering/execute-issue.md`, and `docs/agents/codex-subagent-protocol.md`. Require an explicit integer `max_material_repair_waves` from one through ten, preserve fresh candidate/review evidence per wave, and fail closed at the Grant ceiling. Do not modify `close-issue` or the Wiki repair validator.
- Risks/open questions: The official quick validator requires PyYAML, which is unavailable in the current system and bundled Python runtimes. Attempt it, then run an equivalent YAML/frontmatter constraint check and report the narrower proof boundary if the dependency remains unavailable.
- Verify: `rtk python3 /Users/ron/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/engineering/execute-issue`

### Outcome 3: Prove scope and regression safety
- Work: Confirm no execution-policy reference still imposes a fixed two-wave ceiling, the Wiki-only two-wave ceiling is unchanged, and only the plan plus five intended policy/skill files changed.
- Verify: `rtk node --test tests/ron-workflow/ron-wiki.test.mjs`
- Verify: `rtk wc -w -l skills/engineering/execute-issue/SKILL.md`
- Verify: `rtk git diff --check`
