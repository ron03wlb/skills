---
name: start-project
description: Guide a new software project through greenfield discovery until it is ready for Matt to-spec.
disable-model-invocation: true
---

# Start Project

Guide a Greenfield Software Project through product boundary, product risk, initial architecture, and cost gates. Stop at Ready for Spec. Matt remains the sole Spec, Ticket, implementation, and closeout flow.

## Preflight

1. Read project `AGENTS.md` or `CLAUDE.md`, `docs/agents/issue-tracker.md`, `docs/agents/domain.md`, the root domain glossary, relevant ADRs, and `docs/project/discovery.md` when present.
2. Confirm this is a new SaaS, web or mobile application, API, internal tool, CLI, data system, or AI system without a governing Matt Spec.
3. If this is existing product work, stop and tell the human to invoke `ask-matt`.
4. If tracker or domain setup is absent, stop and tell the human to invoke `setup-matt-pocock-skills`, then resume `start-project`.
5. If the destination or path is too foggy for one session, stop and tell the human to invoke `wayfinder`.
6. If discovery is `frozen`, follow its Matt Spec pointer instead of reopening greenfield discovery, then stop with the exact Issue route:
   - default route: human invokes `implement` for the Issue;
   - after explicit per-Issue dedicated-worktree selection: human invokes `execute-issue`, then separately invokes `close-issue` only after its valid completion note.

Never describe the Ron Issue Lane as `implement` with a worktree. One Issue uses either `implement` or `execute-issue -> close-issue`, never both.

Create `docs/project/discovery.md` lazily after preflight passes. Use [the discovery contract](references/discovery-template.md) as its shape and state vocabulary.

## Gates

Work one gate at a time. Return exactly one outcome: **Continue**, **Revise**, **Hold**, or **Stop**. Record confirmed facts, inferences, assumptions, decisions, and unresolved questions before leaving a gate.

### Product boundary

Apply `greenfield-product-strategy`. Settle the user, buyer, problem evidence, intended outcome, measurable success, MVP, non-goals, time constraint, and initial Budget Envelope.

Complete when the human accepts one product boundary and its exclusions.

### Product risk

Apply `greenfield-risk-review`. Identify the assumption most likely to invalidate the project, the evidence already available, the smallest useful validation action, its decision threshold, and anything that should wait.

Complete when the main product risk has sufficient evidence or a bounded validation action.

### Architecture

Apply `greenfield-mvp-plan` and `greenfield-technical-decisions`. Settle workload assumptions, data sensitivity and ownership, system boundaries, critical quality attributes, credible options, reversibility, migration cost, and operational ownership.

Apply `greenfield-architecture-patterns` only when a named Risk Trigger requires deeper design. Default to the simplest viable architecture.

Complete when the human grants Design Approval to one initial architecture and material trade-offs are recorded.

If discussion cannot settle one narrow state, logic, or visual question, update discovery and stop with this human-invoked sequence:

```text
handoff -> prototype -> handoff -> start-project
```

The prototype supplies evidence; it is not production implementation.

### Cost

Apply `greenfield-cost-model` when infrastructure, paid services, usage-priced APIs, data transfer, storage, or provider lock-in can influence the design. Keep twelve-month Cash TCO and Effort Cost separate. Model 1x, 10x, and 100x workloads plus migration and exit exposure.

Use Matt `research` against primary sources for current prices, free tiers, product capabilities, licensing, availability, or regulations. Date every current fact. An unknown Budget Envelope permits estimation but not a paid provider commitment.

Complete when the human accepts the Cost Baseline, uncertainty, budget fit, and exit exposure.

### Ready for Spec

Confirm every gate has a current result, approvals are explicit, assumptions remain visible, Risk Triggers have proportional controls, glossary and ADR work is current, and Design Approval has not been presented as Implementation Authorization.

Set `status: ready_for_spec`, summarize the approved direction, tell the human to invoke `to-spec`, and stop. Once Matt publishes the Spec, freeze discovery and point `spec` to the tracker artifact.

## Authority boundaries

- Treat `docs/project/discovery.md` and every specialist output as non-authoritative Pre-Spec evidence.
- Keep `CONTEXT.md` glossary-only; use Matt `domain-modeling` for glossary and qualifying ADR changes.
- Let Matt `to-spec` become the sole change contract and `to-tickets` the sole Issue decomposition.
- Use Matt `implement` by default for each Issue.
- Treat the phrase "dedicated worktree" or an equivalent explicit per-Issue choice as selection of the Ron Issue Lane: replace `implement` with `execute-issue`, followed by a separately invoked `close-issue`.
- Keep local integration, Issue closure, push, remote merge, deployment, and live verification as separate claims.
- At every user-invoked skill boundary, update durable state, show the exact next skill and reason, then stop.

Project instructions may narrow tracker, domain, risk, or Implementation Lane policy. Keep the lifecycle here instead of duplicating it in project `AGENTS.md`.
