---
name: explain-decision
description: Explain a live choice when the user asks about options or trade-offs, using a bounded read-only sidecar that does not alter workflow state.
---

# Explain Decision

Use this read-only sidecar only when the user asks to understand, compare, or question the current unresolved choice. Do not run it for every grilling question.

Pause the current question. Build a minimal Decision Explanation Packet containing only:

- the exact decision question;
- two or three live options;
- confirmed constraints and facts;
- the current recommendation;
- necessary Change Spec, Wiki, glossary, ADR, or code pointers.

Do not include the full conversation, entire spec, or unrelated repository history.

Spawn one fresh read-only subagent using `gpt-5.6-sol` with `high` reasoning. Its brief forbids edits, tracker changes, external mutations, nested delegation, and choosing on the user's behalf. Detailed scratch may live in a task-specific `/private/tmp` directory and must be removed after the bounded use.

The subagent returns one Decision Card of about 300 words:

```markdown
## Decision
<plain-language question>

## Options and trade-offs
<two or three options; immediate cost, long-term consequence, and failure mode>

## Reversibility
<what is easy or costly to change later>

## Recommendation
<one recommendation and the reason it best fits confirmed constraints>

## Remaining uncertainty
<facts that could still change the choice>
```

The Coordinator checks the card against the supplied evidence, removes unsupported claims, and returns only the bounded card unless the user asks for detail. Then resume the exact same decision question.

This sidecar never edits a Change Spec, Issue, Authorization Record, `CONTEXT.md`, ADR, Wiki, code, or approval state. Only the user's final selection and a concise rationale may later enter the authoritative workflow.
