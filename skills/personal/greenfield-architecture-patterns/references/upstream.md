# Source and Adaptation

- Verified: 2026-08-14
- Repository: `wshobson/agents`
- Commit: `c4b82b0ad771190355eb8e204b1329732a18449a`
- Paths:
  - `plugins/backend-development/skills/architecture-patterns/SKILL.md`
  - `plugins/backend-development/skills/architecture-patterns/references/details.md`
  - `plugins/backend-development/skills/architecture-patterns/references/advanced-patterns.md`
- Upstream name: `architecture-patterns`
- License: MIT; see `../LICENSE.upstream`

Local adaptation retains pattern vocabulary as decision evidence and removes the upstream implementation posture.

## Reusable Guidance

- Clean Architecture: dependencies point toward business rules; frameworks and storage stay at the edge.
- Hexagonal Architecture: ports define required interactions and adapters implement technologies; in-memory adapters expose useful test seams.
- Domain-Driven Design: bounded contexts own coherent language and data; entities, value objects, aggregates, repositories, and domain events earn use only when domain complexity needs them.
- Anti-Corruption Layers: translate between contexts rather than sharing one model across incompatible domains.

Use these patterns to answer a demonstrated risk: coupling, difficult testing, unclear data ownership, inconsistent language, failure propagation, or expensive replacement. A simple module boundary may solve the problem without layers, interfaces, services, or tactical DDD. Compare that option first.
