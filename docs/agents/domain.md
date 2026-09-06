# Domain Docs

This is a single-context repository. When a task depends on domain vocabulary or changes a workflow contract, search the root glossary and relevant ADRs first.

## Before exploring

- Search task-relevant terms in `CONTEXT.md` and `docs/adr/`; read the matching definitions and governing decisions.
- Expand the read only when those passages refer to another material rule or leave the task ambiguous. Simple questions and typo edits need no full glossary or ADR load.
- If either location is absent, proceed silently; `/domain-modeling` creates domain artifacts only when the conversation resolves durable language or decisions.

## Vocabulary

Use terms exactly as defined in `CONTEXT.md` in Issues, plans, tests, documentation, and code. Avoid synonyms that the glossary marks as ambiguous or retired.

If a required concept is missing, first determine whether existing vocabulary already covers it. Record a new term through `/domain-modeling` only when it represents a durable distinction.

## ADR conflicts

Surface conflicts with an existing ADR explicitly. Do not silently override an architectural decision; identify the ADR and explain why it may need to be superseded.
