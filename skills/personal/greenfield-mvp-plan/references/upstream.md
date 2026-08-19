# Source and Adaptation

- Verified: 2026-08-14
- Repository: `tarunccet/pm-skills`
- Commit: `2203f6dc2a2d952240f845fcaecca6500aeb4dc9`
- Path: `pm-vibe-coding/skills/prototype-plan/SKILL.md`
- Upstream name: `prototype-plan`
- License: MIT; see `../LICENSE.upstream`

Local adaptation retains MVP bounding, dependency ordering, effort uncertainty, and risk identification. It removes direct execution and deployment instructions so Matt `to-spec`, Tickets, and the chosen Implementation Lane remain authoritative.

## Reusable Guidance

- Express the MVP as an outcome rather than a feature inventory.
- Limit essential user outcomes and identify the one slice that proves usefulness.
- Keep a visible parking lot of exclusions.
- Order conceptual work by dependency: domain and data assumptions before dependent interfaces, then end-to-end user value.
- Attach a checkable learning or usability result to each slice.
- Estimate with ranges and adjust for data complexity, integrations, unfamiliar technology, and custom interaction design.
- Name scope creep, authentication, external integrations, unfamiliar stacks, and repeated AI failure loops as possible risks only when they fit the project.

Exclude upstream provider prescriptions, fixed session counts, account provisioning, public deployment, and assumptions about the builder's experience. Those are later implementation or current-fact decisions.
