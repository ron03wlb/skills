# GitHub Decomposition producer binding

This binding supplies the upstream, checkpoint, tracker, and handoff adapters for current `to-tickets@v2`
publication and approved revisions on a configured GitHub repository. It consumes one completed GitHub
`to-spec@v2` publication and handoff, reconciles canonical child Issues, publishes the `decomposition:v1`
record, projects `ready-for-agent`, and appends the composite handoff. It does not approve or reclassify a
Spec, create labels, execute children, close Issues, or provide an automatic Run host.

## Inspect the installed binding

Resolve this reference and its sibling scripts from the current harness's installed personal coordinator. Do
not substitute a source checkout. The package must include `github-to-tickets-entry.mjs`,
`github-to-tickets-adapters.mjs`, the concrete GitHub Spec producer files, and the existing workflow
checkpoint, operation-identity, and GitHub record modules.

The consumer repository owns one credential-free input: `docs/agents/github-producer.json` binds the
`owner/name` repository. Run the read-only inspection from any directory:

```text
node <installed-coordinator>/scripts/github-to-tickets-entry.mjs inspect <repository>
```

`inspect` reads the binding and the authenticated connection and creates no transaction, comment, Issue,
relation, label, or record. A missing binding is `MISSING`, not an inferred capability.

## Child and parent representation

The binding proves the representation per Spec before that Spec's first mutation, from read-only evidence:

- `native` when the configured Issue exposes native sub-issue and dependency summaries and the read-only
  `issues/<Spec>/sub_issues` and `issues/<Spec>/dependencies/blocked_by` reads both succeed. The selected
  Spec may then publish native parent (sub-issue) and native blocking (`blocked_by`) relations in addition
  to the canonical body sections.
- `body` when those native reads are rejected: every child keeps its canonical `## Parent` and
  `## Blocked by` sections, and no native relation is published.
- Refusal when neither can be proven: an unresolved native probe stops before any child, relation, label,
  or parent-record mutation instead of guessing a representation. A caller that explicitly declares
  `native` cannot select it on a repository whose native reads are rejected.

The repository's own Run reader requires native evidence: it re-reads each mapped child's native parent and
its complete native `blocked_by` list and compares them with the published blocker edges, so a decomposed
Spec on this host is accepted only in `native` selection. Body sections stay authoritative for the logical
graph in both selections, and a representation is never changed automatically mid-transaction.

## Invoke the owner adapters

The reusable CLI `invoke` action accepts one structured JSON request through stdin:

```text
node <installed-coordinator>/scripts/github-to-tickets-entry.mjs invoke <repository>
```

Every request carries `action`, `specId`, `target`, `upstreamHandoffIdentity`, optional `readyLabel`, and
the action's `request`. `specId` is a configured-repository Issue number, its immutable `I_` node identity,
or its exact Issue URL. The selected ready label must already exist on the tracker and be bound by the
consumed upstream publication, and it is part of the operation identity, so it cannot change during a
transaction. Preserve the returned operation identity object unchanged across every action and retry.

| CLI actions | Owner surface |
| --- | --- |
| `upstream-publication`, `upstream-handoff` | Read and cross-check the completed GitHub `to-spec@v2` publication, handoff, parent body, Planning Seal, approved scope, ready label, and checkpoint transaction once from the selected parent snapshot. |
| `identity`, `checkpoint-read`, `checkpoint-create`, `checkpoint-advance` | Derive and advance the fresh three-stage `to-tickets@v2` operation through owner read-back only. |
| `children-discover`, `child-read`, `child-publish`, `child-mutation-read`, `child-update`, `child-update-mutation-read` | Discover immutable Decomposition keys plus the complete explicit External blocker set as the mutation preflight; create or reuse exact canonical child Issues with their native parent evidence; or replace one approved unfinished child only from its exact old body/version, completed prior Decomposition, and absent execution-lane evidence. |
| `relation-read`, `relation-publish`, `relation-mutation-read`, `partial-relations-read` | Read or publish one exact native parent or blocking relation when the Spec's `native` selection is proven. |
| `decomposition-read`, `decomposition-publish` | Read or append one immutable `decomposition:v1` record after the complete child, blocker, and native graph passes read-back. |
| `ready-read`, `ready-write` | Read or apply only the existing ready label state derived from open blockers, then return the complete frontier. |
| `handoff-read`, `handoff-append` | Read or append the composite handoff bound to the upstream records, current transaction, Decomposition record, and ready-state receipts. |

Mutation intents contain payload hashes and identities rather than Issue bodies or credentials. Every write
is claimed durably and uses immediate owner read-back; a lost response is resolved by read-back instead of a
second write, and only an explicitly requested retry after a recorded rejection may attempt a rejected
mutation again.

## Canonical child contract

`child-publish`, `child-read`, and `child-update` validate the published canonical child:

- `## Parent` contains exactly the Spec's Issue URL, its immutable node identity, or the equivalent
  `[Spec #<number>](<url>)` link.
- `## Decomposition key` contains exactly one `` `key` ``.
- `## Blocked by` contains either `None.` or unique bullets of full Issue URLs or immutable node
  identities, sorted by reference.
- `## Planning baseline` contains the full local target commit that the consumed Planning Seal binds.
- `## Target` contains the original local target branch, with or without backticks.
- No child body may embed another workflow record or JSON authority payload.

Titles are never identity, and no section other than these is reinterpreted.

## Native relations, refusal, and recovery

A rejected or unresolved native blocker write records the exact child, Decomposition key, expected edge,
request result, and relation read-back as `ABSENT`, `PRESENT`, or `UNKNOWN`. An existing native relation
that points elsewhere is a conflict, never an incomplete match. The binding never changes representation
automatically; before `decomposition.read_back`, the same transaction may resume under newly selected `body`
only when every retained relation read-back is exact `ABSENT`, all children and body edges
read back exactly, no native blocker exists, and no `decomposition:v1` record has been published.
`UNKNOWN` evidence remains fail closed and is never blindly retried.

For this configured host the decomposition stage receipt is exactly
`{decompositionIdentity, decompositionDigest}`, and the ready-state receipt is the exact
`{frontier, states, consistent}` read-back whose `frontier` must equal the record's `readyFrontier`. The
composite handoff carries the upstream publication and handoff identities, its `upstream` binding, the
current transaction identity with both stage receipts, the decomposition identity and digest, the mapping,
the blocker edges, the parent and tracker identity, and the two `recordIdentities` the installed Run reader
consumes.

Blocked or closed children never receive the ready label, and later child lifecycle changes never rewrite
the completed handoff receipt. An unchanged closed child enters a revised Decomposition only through the
six-field `adoptedCompletions` evidence defined by the shared payload contract: the binding re-reads the
previous Spec publication, completed Decomposition transaction and handoff, the latest exact completion
note, the unchanged child body and incoming blockers, the integrated candidate, the absent registered
worktree and topic, and absent old Run ownership before publishing. A missing or conflicting adoption stops
without changing the child.
