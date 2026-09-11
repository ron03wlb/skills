---
status: accepted
---

# Reserve major boundaries and migration costs

The human decides new major direction, architecture, table DDL, data corrections, destructive or costly effects, and any migration cost. A concrete data, state, consumer or operational transition is a migration cost even when small or the code can be reverted; ordinary implementation effort alone is not. Applicable accepted decisions remain reusable, while precedent and model confidence support recommendations rather than approve new reserved choices.

Within settled boundaries, the agent decides routine reversible details, including application queries and bindings, from accepted requirements and project contracts, then consistent source conventions, then suitable established practice. It checks precedent fit, required behavior, important failure cases and practical reversal, and retains concise evidence and verification assumptions. Multiple plausible options alone do not justify a question. Retaining an existing design that meets accepted requirements needs no reconfirmation; an unselected alternative with migration costs adds no question. Human decisions receive a coherent proposal, feasible alternatives, trade-offs, reasons, migration impact and a recommendation. Table DDL and other reserved SQL arrive as one exact change set; its approved artifact is prepared before dependent implementation. Database execution and declared Manual prerequisites retain their own authority.

This supersedes ADR-0070's blanket SQL approval rule and its evidence-only escape for new reserved choices. It retains the decision aperture, honest provenance, approval reuse, planning-lane isolation and explicit publication boundaries. Compared with asking about every SQL change, this reduces routine review work; the trade-off is greater reliance on the agent's consequence analysis, checked through realistic scenarios rather than wording tests alone.

Basis: in task `01a08e76-78da-74a3-8fba-ad4949c77095` on 2026-09-11, the human requested fewer decisions with stable quality, reserved major direction, architecture and table DDL, then explicitly accepted delegating routine reversible SQL and added all decisions with migration costs. This records human-confirmed policy, not measured improvement or execution authority.
