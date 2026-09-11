---
status: accepted
---

# Use body parent evidence without GitLab Issue hierarchy

When the configured GitLab project has no proven native Issue hierarchy, `to-tickets@v2` uses each canonical child `## Parent` reference together with the parent `decomposition:v1` mapping and exact body digest as the complete parent evidence. The concrete GitLab adapter publishes no native parent relation in that case and never substitutes `relates_to`; that link expresses neither hierarchy nor execution dependency.

This is a fixed provider binding, not another repository setting. It adds no `parentRepresentation`, capability mutation probe, producer profile, checkpoint stage, or recovery branch. `Blocking representation: body|native` remains independent and controls only blocker evidence. A future configured and proven native GitLab hierarchy implementation requires a successor decision and matching adapter contract; until then, the binding fails closed instead of inferring support.

The rejected alternatives were to fail every decomposition on GitLab without native hierarchy, to misrepresent hierarchy with `relates_to`, or to add a second representation setting. The selected evidence remains portable and read-backable without weakening child identity or parent publication completeness.

Basis: in task `01a08eb8-262f-7642-bd78-e4df0dce015a` on 2026-09-11, the human explicitly accepted canonical child `## Parent` plus parent `decomposition:v1` as the fallback and rejected `relates_to` as hierarchy evidence.
