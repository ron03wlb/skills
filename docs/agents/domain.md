# Domain Docs

This is a single-context repository. Engineering skills consume the root glossary and system ADRs before changing the workflow contract.

## Before exploring

- Read `CONTEXT.md` at the repository root.
- Read relevant decisions under `docs/adr/`.
- If either location is absent, proceed silently; `/domain-modeling` creates domain artifacts only when the conversation resolves durable language or decisions.

## Vocabulary

Use terms exactly as defined in `CONTEXT.md` in Issues, plans, tests, documentation, and code. Avoid synonyms that the glossary marks as ambiguous or retired.

If a required concept is missing, first determine whether existing vocabulary already covers it. Record a new term through `/domain-modeling` only when it represents a durable distinction.

## ADR conflicts

Surface conflicts with an existing ADR explicitly. Do not silently override an architectural decision; identify the ADR and explain why it may need to be superseded.
