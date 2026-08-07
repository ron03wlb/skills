---
status: superseded by ADR-0021
---

# Reviewed Markdown owns Wiki truth

The accepted Markdown files in the target branch own Ron's current business-knowledge baseline. A replaceable Wiki engine may propose exact patches within granted write sets, but its prompts, state, cache, and regeneration output never override the reviewed Markdown.

Human-authored and engine-proposed changes therefore use the same Issue, Grant, candidate review, and closeout path. This avoids generator lock-in and a second canonical copy while preserving bounded automation.

This refines [ADR 0004](./0004-repository-docs-as-code-is-the-canonical-wiki.md).
