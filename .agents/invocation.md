# Model-invoked vs user-invoked

Every `SKILL.md` in this repo is a skill. The one axis that splits them is **invocation**, who can reach it:

- **User-invoked**: reachable **only by the human typing its name**. Set `disable-model-invocation: true` in the frontmatter (Claude Code) and `policy.allow_implicit_invocation: false` in `agents/openai.yaml` (Codex). The `description` is **human-facing**: a one-line summary read by a person browsing slash-commands. Strip trigger lists ("Use when the user says…").
- **Model-invoked**: reachable by **model or user**. The default: omit `disable-model-invocation` and the `policy` block from `agents/openai.yaml`. The `description` is **model-facing** and keeps rich trigger phrasing ("Use when the user wants…, mentions…, asks for…") so auto-invocation fires. The test for whether a skill should stay model-invoked: _could the model usefully reach for this autonomously?_ (Reuse is the reason to extract a skill, not the test.)

Each harness excludes a user-invoked skill from the model's reach in its own way, so nothing but the human can fire it: no other skill can. A user-invoked skill may invoke model-invoked skills, but it can never reach another user-invoked skill.

Every skill also carries an `agents/openai.yaml` beside its `SKILL.md`. It holds Codex UI metadata: `interface.display_name` and `interface.short_description` for the skill picker, and, for user-invoked skills, the `policy.allow_implicit_invocation: false` that pairs with `disable-model-invocation`. Keep the two in sync: a skill is user-invoked in both harnesses or neither.

Bucket `README.md`s and the top-level `README.md` group entries into **User-invoked** and **Model-invoked**.

## Dependencies between them

Dependencies use an explicit instruction to load and follow a **named skill**. Resolve invocation permission and the required source first, then choose the host's loading mechanism:

- When a generic Skill tool is available, use it for permitted dependencies, retaining the selected source.
- Otherwise use the host-supported named-skill mechanism to read and follow the required `SKILL.md`. The absence of a tool name alone does not require another human invocation of already authorized work.
- Report actual missing or inaccessible content, conflicting identities, and higher-priority host restrictions at their boundary. Tool availability cannot authorize a dependency or select a different source.

When a workflow pins its source, Matt/Ron owners and their references stay in the selected immutable package; generic helpers use the current host catalog. Never silently substitute a newer local skill for a pinned owner. If the host cannot load the selected identity, report that limitation instead of following another copy.

Shared reference docs live inside the skill that owns them; other skills load that named owner to reach its material. Express dependencies by name rather than deep `../other-skill/FILE.md` cross-references or bare `/skill` labels. Host-supported reading of the resolved `SKILL.md` is a loading mechanism, not a new dependency convention.

This is about **operative** instructions: a skill's own steps telling the agent to go run another skill right now. Router prose that just names skills for a human to pick from (`ask-matt`, bucket `README.md`s) isn't invoking anything, so it keeps `/skill`-style names as plain labels.

Use one named skill per invocation. A step that needs two skills loads each separately: `Load "grilling" and "domain-modeling" as separate named skills; use the generic Skill tool when available, otherwise the host-supported named-skill mechanism.` With the Skill tool, that means two calls, each with one name.

This convention only permits dependencies that are **model-invoked**. A user-invoked skill can never be called automatically by another skill, including through the Skill tool or a loading fallback. Reading its file does not change that restriction. When a step needs a user-invoked skill (e.g. `setup-matt-pocock-skills`), tell the human to run `/setup-matt-pocock-skills`. Loading fallback changes the mechanism only; invocation policy and source authority still apply.

## Passive vs active domain work

Merely _reading_ `CONTEXT.md` for vocabulary is a one-line prose pointer, not the `domain-modeling` skill. Only the active build/sharpen discipline (challenge terms, edge-case scenarios, write ADRs, update `CONTEXT.md` inline) is `domain-modeling`.
