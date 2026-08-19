# Source and Adaptation

- Verified: 2026-08-14
- Repository: `tarunccet/pm-skills`
- Commit: `2203f6dc2a2d952240f845fcaecca6500aeb4dc9`
- Path: `pm-vibe-coding/skills/technical-decision-guide/SKILL.md`
- Upstream name: `technical-decision-guide`
- License: MIT; see `../LICENSE.upstream`

Local adaptation keeps the decision-tree posture and plain-language trade-offs while removing static provider conclusions and implementation prompts.

## Reusable Guidance

Frame early choices around constraints:

- relational, document, realtime, key-value, or file-heavy data shape;
- managed-service speed versus operational control;
- authentication risk and hosted versus custom boundaries;
- modular monolith versus service separation;
- REST versus GraphQL based on actual client and query needs;
- frontend delivery shape and team familiarity;
- payment model and hosted checkout boundaries; and
- existing infrastructure or team standards.

For each choice, explain what becomes easier, what becomes harder, what failure appears if the choice is wrong, and how costly migration would be. Prefer a modular monolith and established managed boundaries until confirmed scale, compliance, ownership, or availability constraints justify more.

Provider names, prices, product limits, and ecosystem claims age quickly. Verify them through current primary sources before using them as decision evidence.
