# ADR Format

Follow the repository's existing ADR location, template, naming, numbering, and status conventions. When none exists, use `docs/adr/` with sequential names: `0001-slug.md`, `0002-slug.md`, etc.

Create the selected ADR directory lazily: only when the first ADR is needed.

## Template

```md
# {Short title of the decision}

{1-3 sentences: context, decision, rationale, and evidence. Identify whether the basis is inherited, human-confirmed, or delegated, with its source.}
```

That's it. An ADR can be a single paragraph. The value is in recording *that* a decision was made and *why*, not in filling out sections.

## Optional sections

Only include these when they add genuine value. Most ADRs won't need them.

- **Status** frontmatter (`proposed | accepted | deprecated | superseded by ADR-NNNN`): useful when decisions are revisited
- **Considered Options**: only when the rejected alternatives are worth remembering
- **Consequences**: only when non-obvious downstream effects need to be called out
- **Reversal or validation**: the practical way to revisit the choice or check an assumption when it affects the decision

## Numbering

When using the fallback convention, scan `docs/adr/` for the highest existing number and increment by one.

## When to record an ADR

Record a settled decision when its rationale has lasting value: a meaningful trade-off, a non-obvious boundary, an external constraint, or a deliberate departure that future work might otherwise undo. Reversibility does not disqualify it. Group related decisions around one rationale; avoid an ADR per routine choice.

Routine adoption of an existing convention needs only its source reference. Exact feature behavior, numeric defaults, exclusions, and acceptance checks belong in the Spec or the settled handoff leading to it, not in the glossary. An ADR records decision provenance, not implementation status or new operation permission. Under scoped delegation, accepted status may describe an agent-decided choice; identify it honestly rather than claiming individual human approval.

### What qualifies

- **Architectural shape.** "We're using a monorepo." "The write model is event-sourced, the read model is projected into Postgres."
- **Integration patterns between contexts.** "Ordering and Billing communicate via domain events, not synchronous HTTP."
- **Technology choices that carry lock-in.** Database, message bus, auth provider, deployment target. Not every library: just the ones that would take a quarter to swap out.
- **Boundary and scope decisions.** "Customer data is owned by the Customer context; other contexts reference it by ID only." The explicit no-s are as valuable as the yes-s.
- **Deliberate deviations from the obvious path.** "We're using manual SQL instead of an ORM because X." Anything where a reasonable reader would assume the opposite. These stop the next engineer from "fixing" something that was deliberate.
- **Constraints not visible in the code.** "We can't use AWS because of compliance requirements." "Response times must be under 200ms because of the partner API contract."
- **Rejected alternatives when the rejection is non-obvious.** If you considered GraphQL and picked REST for subtle reasons, record it; otherwise someone will suggest GraphQL again in six months.
