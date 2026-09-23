# Decomposition relation reconciliation

Read this reference only while selecting `body` or `native` blocking representation, reconciling tracker-supported identities, or recovering partial child/relation publication. It owns provider relation evidence and partial-publication recovery; the current producer owns the ordered stage receipts.

## Preflight

Derive the complete expected key set, canonical child contracts, owned blocker edges, and readable External blockers from the approved parent before mutation. Read the [canonical child contract](canonical-child-contract.md) while rendering or validating each child. Discover every tracker-supported identity source for every expected key and parent before any mutation.

`tracker.discoverChildren` returns one selected `blockingRepresentation`: `body` or `native`. For GitLab, a new configuration declares `body` unless an operator has manually proven and declared `native`; an existing missing value is `UNKNOWN` and stops before child, relation, label, or parent-record mutation with one explicit `body` or `native` repair. Capability discovery never writes a relation, a generic HTTP 400 never selects body mode, and a declared-native write or read-back failure remains a Recoverable blocker.

Every canonical child body carries the same logical blocker edges in `## Blocked by` for `body` or `native` representation. In `body` representation there is no native blocking relation; `native` representation requires native blocking relation evidence. Body parent, target, Planning Seal, executable contract, canonical body edges, and applicable native evidence must all agree. A provider with proven native hierarchy additionally requires matching native parent evidence. GitLab binding without proven native Issue hierarchy uses canonical child `## Parent`, parent `decomposition:v1` mapping, and exact body digest as complete parent evidence; it publishes no native parent relation and never substitutes `relates_to`. Titles are ignored. Neither representation adds a `blocked` label or a `relates_to` link; `ready-for-agent` projects the published logical graph.

Classify every expected key before mutation:

- **Zero matches:** create exactly one child later, blockers before dependants.
- **One matching Issue:** reuse it only when every supported identity source and complete canonical contract match. The sole incomplete match is an absent expected native relationship bound by prior partial-publication evidence, or the body-mode adoption below.
- **More than one match:** stop without mutation and report the duplicate key and Issue identities.

A conflict in key, parent, target, Planning Seal, executable contract, canonical body edges, or applicable native relationship stops without mutation; never automatically repair conflicting evidence. Validate all matches, the owned acyclic graph, and every External blocker before creating a child. An External blocker is readable evidence only: `to-tickets` never creates, edits, closes, or assumes ownership of it.

## Partial publication

Read prior partial-publication state and bind its exact child, key, expected relation, and failed read-back before continuing. In `native` representation, Complete only an absent native relationship whose exact child identity, Decomposition key, expected relation, and failed read-back are bound by that state; then read it back once. A conflicting relation stops without mutation.

A retry may adopt newly configured `body` representation only before `decomposition.read_back`, after a prior partial native failure, when every bound child identity, Decomposition key, canonical body, expected logical blocker edge, and parent-record state reads back exactly. There must be no conflicting native relation or `decomposition:v1` record. Completed-stage adoption, missing bound evidence, a body or edge mismatch, a conflicting native relation, or any parent-record evidence stops without repair or duplicate mutation.

A **pre-record child recovery** is available only when the proposed replacement binds the exact prior `to-tickets` checkpoint identity and transaction, acknowledged child-create mutation (old title, body, key, parent, and version), and completed `to-spec` publication/handoff lineage. The prior transaction is `INCOMPLETE`, has no completed stages, and first requires `decomposition.read_back`; it has no Decomposition or composite handoff. Before each write/read-back, the child must be open, unlabelled, unchanged in body/title/version, have no native parent or blocker relation, no implementation lifecycle record, no Run dispatch for this parent, and an old Planning Seal equal to the prior transaction binding. Any missing, rejected, completed, active, related, drifted, duplicate, foreign-target, or scope-equal evidence fails closed. Settle a lost replacement response only by exact replacement-body read-back, never by a second PATCH.

## Publish missing children

Render one canonical child contract through the configured adapter:

- **Local tracker:** write one file per missing child under `.scratch/<feature>/issues/`, using the Decomposition key for discovery and local parent/blocker references.
- **A real issue tracker:** create one Issue per missing child and render the same body. Add every proven native parent relation. In `native` representation add expected native blocking relations; in `body` representation publish none. A provider without native hierarchy retains the body-and-record parent evidence above.

Read each published Issue back once and require its Decomposition key, canonical body blocker edges, Acceptance Criteria mapping, Planning baseline, parent, target, and applicable native relation evidence to match. A declared-native relationship write or read-back failure binds the exact child identity, Decomposition key, expected absent relationship, and failed read-back in partial-publication state; it is a Recoverable blocker and never changes representation. Report created identities, selected representation, Planning Seal, and exact matched or missing keys, then stop without modifying the parent or unrelated Issues.
