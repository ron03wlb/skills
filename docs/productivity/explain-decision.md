## What it does

`explain-decision` explains one live choice through a fresh read-only sidecar and returns a bounded Decision Card.

It does not decide for the user or modify the spec, Issue, Wiki, glossary, ADR, code, or authorization state. Only the final human choice returns to the main workflow.

## When to reach for it

Type `/explain-decision`, or the agent reaches for it automatically when you explicitly ask to understand or compare the current unresolved options. For stress-testing the whole plan one decision at a time, use [grilling](https://aihero.dev/skills-grilling).

## Context isolation

The sidecar receives only the exact question, two or three options, confirmed constraints, the current recommendation, and necessary pointers. It returns about 300 words covering trade-offs, consequences, reversibility, recommendation, and uncertainty.

This keeps explanatory exploration from consuming the main decision context.

## It's working if

- The response compares only the live options and names the current recommendation and remaining uncertainty.
- The main workflow resumes at the same unresolved question after the explanation.
- No spec, Issue, Wiki, glossary, ADR, code, or authorization state changes.

## Where it fits

This is a reach-for-it-anytime sidecar inside [grill-me](https://aihero.dev/skills-grill-me) or [grill-with-docs](https://aihero.dev/skills-grill-with-docs). It resumes the same question afterward. See [ask-matt](https://aihero.dev/skills-ask-matt) for the wider skill map.
