---
name: domain-modeling
description: Change domain concepts, their glossary definitions, or architectural decisions. Use for active modeling, not existing-term lookup or incidental wording edits.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline: challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* `CONTEXT.md` for vocabulary is not this skill: that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)

## Active Spec workflow lanes

When the caller supplies an active **Spec workflow lane**, validate its Codex task, proposed Tracker Spec, target, baseline, and isolated planning worktree before writing. Record accepted `CONTEXT.md` or ADR changes only in that planning worktree and return their exact paths or hunks and content identities to the lane owner. A lane identity mismatch is a Hard gate that stops before any write; keep the target checkout and every other lane unchanged.

Standalone invocation keeps the ordinary current-worktree behavior below. It never invents a planning lane or treats unrelated worktree state as one.

## File structure

Most repos have a single context:

```
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

If a `CONTEXT-MAP.md` exists at the root, the repo has multiple contexts. The map points to where each one lives:

```
/
├── CONTEXT-MAP.md
├── docs/
│   └── adr/                          ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/                 ← context-specific decisions
│   └── billing/
│       ├── CONTEXT.md
│       └── docs/adr/
```

Create files lazily: only when you have something to write. If no `CONTEXT.md` exists, create one when the first term is resolved. Use the repository's ADR location and conventions; [ADR-FORMAT.md](./ADR-FORMAT.md) supplies the fallback when none exists.

## During the session

Load "grilling" as a named model-invoked skill before resolving a new choice: use the generic Skill tool when available, otherwise the host-supported mechanism to read and follow its required `SKILL.md`. Preserve the selected source and invocation restrictions, and reuse an already loaded matching owner and settled scope. Apply its decision boundaries. Inherited decisions and evidence-backed reversible choices under scoped delegation can be recorded directly; identify their source and basis. Ask only for unresolved intent or a costly commitment that evidence and existing approval cannot settle, including any SQL adjustment. Recording an ADR does not approve editing or executing SQL.

### Challenge against the glossary

When a term conflicts with `CONTEXT.md`, identify the contradiction and check the governing requirement. Preserve the existing meaning when the evidence resolves it; ask a concrete question only when the intended business meaning remains ambiguous.

### Sharpen fuzzy language

Resolve vague terms from the accepted model and source where possible. If "account" could still mean Customer or User with different behavior, ask that missing business decision with a recommendation.

### Discuss concrete scenarios

Stress-test relationships with concrete in-scope scenarios. Resolve cases covered by existing decisions yourself; bring back only scenarios that expose a missing intent or costly commitment.

### Cross-reference with code

Check whether code agrees with the stated behavior. Surface a contradiction with the relevant source and governing decision; do not treat current implementation as authority to override the user's intended change.

### Update CONTEXT.md inline

When a term is resolved, update `CONTEXT.md` right there. Don't batch these up: capture them as they happen. Use the format in [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).

`CONTEXT.md` should be totally devoid of implementation details. Do not treat `CONTEXT.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Record durable decisions

Use [ADR-FORMAT.md](./ADR-FORMAT.md) for the recording threshold and project-first format. Record a qualifying settled decision directly within document-writing authority; deciding whether it deserves an ADR is separate from deciding whether it needs human approval. Record the actual decision basis, evidence, rationale, and relevant reversal or validation assumption. Preserve an existing ADR unless an authorized decision explicitly supersedes its affected scope.
