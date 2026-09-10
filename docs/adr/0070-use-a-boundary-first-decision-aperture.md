---
status: accepted
---

# Use a boundary-first decision aperture for codebase grilling

Within the agreed goal, design requests still delegate evidence-backed choices that can be reversed at low cost. A caller may now supply a **Decision aperture** over the full design tree: choices outside it remain required design work but become delegated defaults from explicit decisions and project contracts, then source conventions, then suitable established practice. The aperture filters questions rather than limiting their count. It cannot supply the overall goal, expand scope, grant operation permission, or absorb a costly or irreversible commitment.

`grill-with-docs` supplies a boundary-first aperture. The human frontier contains persistence creation, split, merge, ownership, aggregate, system-of-record, destructive lifecycle and migration boundaries; major module, system, external-contract, trust and authorization directions; missing scope or operation permission; and costly or irreversible commitments. Ordinary business and implementation details within those settled boundaries are resolved and carried to the handoff with their basis, practical reversal and verification assumptions. Multiple plausible answers do not alone create a human question.

Every SQL adjustment remains costly and needs prior approval for its exact effect. The agent derives constituent columns, types, indexes, queries, bindings and validation from evidence and presents one coherent exact change set instead of asking about each detail. Approval splits only where effects or permissions are independent. Approved SQL is prepared and validated before dependent application implementation; database execution and declared Manual prerequisites retain their own authority.

Record inherited, human-confirmed and delegated bases honestly. Qualifying glossary and ADR writes stay within the existing planning-lane contract; exact behavior, defaults, exclusions and verification needs stay in the handoff and subsequent Spec. `to-spec` consumes settled choices without another interview. This ADR supersedes ADR-0068 while retaining its delegated-design, SQL, provenance and publication boundaries.

Basis: in task `01a08a94-e29a-7843-a66c-e79ae4bb7669` on 2026-09-10, the human reported that grilling still exposed too many detailed decisions and approved a boundary-first contract: ordinary business detail follows the project or established practice, while table boundaries and major directions remain the primary questions. The shared `grilling` primitive gains only the caller-supplied aperture mechanism so callers without one keep their existing interview policy.

Validation: structural contract tests must prove the shared aperture mechanism, the `grill-with-docs` boundary policy, domain-modeling inheritance, one-package SQL approval and public documentation alignment. Fresh model rehearsals must separately cover an ordinary ambiguous detail, a persistence-boundary decision and a multi-part SQL proposal; until run, they remain unverified behavior rather than inferred improvement.
