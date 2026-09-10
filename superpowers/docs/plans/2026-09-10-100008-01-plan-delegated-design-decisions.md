# Delegate reversible design decisions with an explicit SQL boundary

**Goal:** Reduce unnecessary design questions while retaining evidence, scoped authority, and early SQL preparation.
**Why planning is required:** The change affects public skill contracts and how planning decisions carry authority into document writes and Spec publication.
**Acceptance:** Evidence-backed reversible decisions within the agreed goal resolve without individual or blanket reconfirmation. Unresolved goal/business ambiguity, new scope or permission, and irreversible or costly changes still require the missing human decision. Every SQL adjustment is costly, including embedded queries and local SQL artifacts; inspect and present its proposed effect before asking, reuse exact existing approval, and prepare and validate approved SQL before dependent application implementation. Database application and declared Manual prerequisite attestations retain their existing owners. ADRs follow repository conventions and record durable rationale with honest decision provenance. Planning lanes and explicit publication boundaries remain intact. No product SQL, database, tracker, commit, push, or installation action is part of this task.

### Outcome 1: One decision policy drives the design flow
- Work: Update `grilling`, `grill-with-docs`, `domain-modeling`, ADR guidance, the planning glossary, and one ADR. Carry inherited, human-confirmed, and delegated decision provenance into the existing handoff without a new registry or schema.
- Verify: Inspect the decision path from caller through document writer and `to-spec`, including SQL and pending-evidence branches.

### Outcome 2: Discovery and downstream guidance agree
- Work: Synchronize promoted skill docs, affected metadata, README entries, the router, and Run preparation guidance. Preserve explicit invocation and existing prerequisite execution boundaries.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs tests/ron-workflow/grilling-contract.test.mjs tests/ron-workflow/run-preparation.test.mjs`

### Outcome 3: Validate decisions, artifacts, and preservation
- Work: Adapt existing structural checks without presenting text matching as behavior proof. Run independent model scenarios for reversible decisions, unclear business intent, SQL approval and reuse, and handoff provenance; record only observed outcomes. Perform a scoped independent review and preserve unrelated work.
- Verify: Skill frontmatter validation, independent scenario outputs, focused contract checks, relevant final diff review, and `git diff --check`.
