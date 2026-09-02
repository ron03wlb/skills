# Productivity

General workflow tools, not code-specific.

## User-invoked

Reachable only when you type them (Claude Code: `disable-model-invocation: true`; Codex: `policy.allow_implicit_invocation: false` in `agents/openai.yaml`).

- **[confirm-understanding](./confirm-understanding/SKILL.md)** — Calibrate your understanding against chosen evidence with a bounded multiple-choice check.
- **[grill-me](./grill-me/SKILL.md)** — Get relentlessly interviewed about a plan or design until every branch of the decision tree is resolved.
- **[handoff](./handoff/SKILL.md)** — Compact the current conversation into a handoff document so another agent can continue the work.
- **[teach](./teach/SKILL.md)** — Teach the user a new skill or concept over multiple sessions, using the current directory as a stateful teaching workspace.
- **[to-questionnaire](./to-questionnaire/SKILL.md)** — Turn a decision you cannot fully answer into a Markdown questionnaire for the person who can.
- **[wait-what](./wait-what/SKILL.md)** — Re-pitch a message that did not land using plain English and the repository's ubiquitous language.

## Model-invoked

Model- or user-reachable (rich trigger phrasing so the model can reach for them).

- **[grilling](./grilling/SKILL.md)** — Interview the user relentlessly about a plan, decision, or idea until every branch of the decision tree is resolved.
- **[explain-decision](./explain-decision/SKILL.md)** — Explain one live choice in a bounded read-only sidecar without changing workflow state.
- **[writing-for-agents](./writing-for-agents/SKILL.md)** — Write predictable skills, `AGENTS.md`, `CLAUDE.md`, and other documents consumed by agents.
