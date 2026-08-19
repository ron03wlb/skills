---
name: greenfield-technical-decisions
description: Produce advisory early-architecture decision evidence during start-project discovery. Use when a greenfield project needs options for data, hosting, authentication, system shape, API boundaries, frontend, integrations, or payments before Matt to-spec.
---

# Greenfield Technical Decisions

Produce decision evidence for the Architecture Gate. Read [the adapted upstream reference](references/upstream.md) before applying it.

For each live decision:

1. state the decision question;
2. state the workload, data, quality, team, budget, and compliance constraints;
3. compare two or three credible options;
4. show immediate cost, long-term consequence, failure mode, reversibility, and migration path;
5. recommend the simplest option that fits confirmed constraints; and
6. label supporting facts, inferences, assumptions, and missing evidence.

Cover only decisions that materially affect the initial architecture. Use current primary-source research before naming a provider, price, free tier, product capability, license, or regulatory property. Treat static upstream tool suggestions as candidates, not facts.

Keep the result advisory. Do not implement the selection, create a Matt Spec or ADR, promise scale, or substitute generic best practices for project evidence. Use Matt `domain-modeling` when an accepted, hard-to-reverse trade-off qualifies for an ADR.
