---
name: start-project
description: Guide a new software project through greenfield discovery until it is ready for Matt to-spec.
disable-model-invocation: true
---

# Start Project

Guide a Greenfield Software Project through product boundary, product risk, initial architecture, and cost gates. Stop at Ready for Spec. Matt remains the sole Spec, Ticket, implementation, and closeout flow.

## Preflight

1. Read project `AGENTS.md` or `CLAUDE.md`, `docs/agents/issue-tracker.md`, `docs/agents/domain.md`, the root domain glossary, relevant ADRs, and `docs/project/discovery.md` when present.
2. If a governing Spec is already published or discovery is `frozen`, read that Spec and its published next command. Preserve completed discovery as `frozen` with its Spec pointer, tell the human to follow that exact command, and stop. If the pointer or command is missing or conflicting, report the missing evidence and tell the human to invoke `/ask-matt`; do not infer an implementation route.
3. Otherwise confirm this is a new SaaS, web or mobile application, API, internal tool, CLI, data system, or AI system. For existing product work, stop and tell the human to invoke `/ask-matt`.
4. If tracker or domain setup is absent, stop and tell the human to invoke `/setup-matt-pocock-skills`, then resume `/start-project`.
5. If the destination or path is too foggy for one session, stop and tell the human to invoke `/wayfinder`.

Create `docs/project/discovery.md` lazily after preflight passes. Use [the discovery contract](references/discovery-template.md) as its shape and state vocabulary.

## Gates

Work one gate at a time. Return exactly one outcome: **Continue**, **Revise**, **Hold**, or **Stop**. Record confirmed facts, inferences, assumptions, decisions, and unresolved questions before leaving a gate.

### Product boundary

Call the Skill tool with "greenfield-product-strategy". Settle the user, buyer, problem evidence, intended outcome, measurable success, MVP, non-goals, time constraint, and initial Budget Envelope.

Complete when the human accepts one product boundary and its exclusions.

### Product risk

Call the Skill tool with "greenfield-risk-review". Identify the assumption most likely to invalidate the project, the evidence already available, the smallest useful validation action, its decision threshold, and anything that should wait.

Complete when the main product risk has sufficient evidence or a bounded validation action.

### Architecture

Call the Skill tool twice, once with "greenfield-mvp-plan" and once with "greenfield-technical-decisions". Settle workload assumptions, data sensitivity and ownership, system boundaries, critical quality attributes, credible options, reversibility, migration cost, and operational ownership.

Only when a named Risk Trigger requires deeper design, call the Skill tool with "greenfield-architecture-patterns". Default to the simplest viable architecture.

Complete when the human grants Design Approval to one initial architecture and material trade-offs are recorded.

If discussion cannot settle one narrow state, logic, or visual question, update discovery and stop with this human-invoked sequence:

```text
handoff -> prototype -> handoff -> start-project
```

The prototype supplies evidence; it is not production implementation.

### Cost

When infrastructure, paid services, usage-priced APIs, data transfer, storage, or provider lock-in can influence the design, call the Skill tool with "greenfield-cost-model". Keep twelve-month Cash TCO and Effort Cost separate. Model 1x, 10x, and 100x workloads plus migration and exit exposure.

For current prices, free tiers, product capabilities, licensing, availability, or regulations, call the Skill tool with "research" against primary sources. Date every current fact. An unknown Budget Envelope permits estimation but not a paid provider commitment.

Complete when the human accepts the Cost Baseline, uncertainty, budget fit, and exit exposure.

### Ready for Spec

Confirm every gate has a current result, approvals are explicit, assumptions remain visible, Risk Triggers have proportional controls, proposed glossary and ADR decisions are ready for handoff, and Design Approval has not been presented as Implementation Authorization.

Set `status: ready_for_spec` and summarize the approved direction as discovery evidence. Choose the next human invocation from the available planning evidence:

- This task already has a matching `grill-with-docs` Planning handoff packet for its proposed Spec and target: tell the human to invoke `/to-spec` with that packet and discovery evidence. `to-spec` owns lane and baseline revalidation.
- No matching packet exists: tell the human to invoke `/grill-with-docs` with discovery evidence to establish the Spec workflow lane and settle accepted glossary or ADR changes. That skill produces the packet for `/to-spec`. If the repository or required setup is absent, report it as the prerequisite for this handoff.

Stop after the handoff. `ready_for_spec` records discovery completion; it is not a Planning handoff packet or publication authority. On later re-entry after Spec publication, freeze discovery and set `spec` to the published tracker artifact.

## Authority boundaries

- Treat `docs/project/discovery.md` and every specialist output as non-authoritative Pre-Spec evidence.
- Keep proposed glossary and ADR decisions in discovery until a matching Spec workflow lane exists. For accepted domain changes inside that lane, call the Skill tool with "domain-modeling", passing the same lane identity. The planning owner supplies the accepted paths and content identities to `/to-spec`.
- Let Matt `to-spec` become the sole change contract and `to-tickets` the sole Issue decomposition.
- Follow the published Tracker Spec command. `/implement` applies only to an approved Standalone Spec or explicit direct current-branch work; a dedicated-worktree preference does not replace the published Tracker Spec route.
- Keep local integration, Issue closure, push, remote merge, deployment, and live verification as separate claims.
- At every user-invoked skill boundary, update durable state, show the exact next skill and reason, then stop.

Project instructions may narrow tracker, domain, or risk policy. This skill owns discovery only; planning, publication, and delivery remain with their existing Matt skills.
