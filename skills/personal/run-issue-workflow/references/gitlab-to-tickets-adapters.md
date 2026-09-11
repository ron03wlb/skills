# GitLab Decomposition producer binding

This binding supplies the upstream, checkpoint, tracker, and handoff adapters for current `to-tickets@v2` publication and approved revisions. It consumes one completed GitLab `to-spec@v2` publication and handoff, reconciles canonical child Issues, publishes the `decomposition:v1` record, projects `ready-for-agent`, and appends the composite handoff. It does not approve or reclassify a Spec, create labels, execute children, close Issues, or provide an automatic GitLab Run host.

## Inspect the installed binding

Resolve this reference and its sibling scripts from the current harness's installed personal coordinator. Do not substitute a source checkout. The package must include `gitlab-to-tickets-entry.mjs`, `gitlab-to-tickets-adapters.mjs`, the concrete GitLab Spec producer files, and the existing workflow checkpoint and operation-identity modules.

The consumer repository owns two credential-free inputs:

- `docs/agents/gitlab-producer.json` binds the GitLab origin and project.
- `docs/agents/issue-tracker.md` contains exactly one `Blocking representation: body|native` declaration.

Run the read-only inspection from any directory:

```text
node <installed-coordinator>/scripts/gitlab-to-tickets-entry.mjs inspect <repository>
```

`inspect` reads the repository remote, project, authenticated identity, and both configuration files. It creates no transaction, intent, relation, label, note, or Issue. A missing blocker declaration is `UNKNOWN`, not an inferred capability. New GitLab setup defaults it to `body`; only an operator-proven native implementation may declare `native`.

This concrete binding does not claim GitLab Issue hierarchy support. Each canonical child carries its exact `## Parent` reference; together with the parent `decomposition:v1` mapping and exact body digest, that is the complete parent evidence. The adapter publishes no native parent relation and never substitutes `relates_to`. This fixed fallback adds no parent representation setting or capability mutation probe, while native blocking evidence remains independent.

## Invoke the owner adapters

The reusable CLI `invoke` action accepts one structured JSON request through stdin:

```text
node <installed-coordinator>/scripts/gitlab-to-tickets-entry.mjs invoke <repository>
```

Every request carries `action`, `specId`, `target`, `upstreamHandoffIdentity`, optional `readyLabel`, and the action's `request`. `specId` is a positive configured-project IID or its exact Issue URL. The selected ready label is part of the operation identity and cannot change during a transaction. Preserve the returned operation identity object unchanged across every action and retry.

| CLI actions | Owner surface |
| --- | --- |
| `upstream-publication`, `upstream-handoff` | Read and cross-check the completed GitLab `to-spec@v2` publication, handoff, parent body, Planning Seal, approved scope, and checkpoint transaction. |
| `identity`, `checkpoint-read`, `checkpoint-create`, `checkpoint-advance` | Derive and advance the fresh three-stage `to-tickets@v2` operation through owner read-back only. |
| `children-discover`, `child-read`, `child-publish`, `child-mutation-read`, `child-update`, `child-update-mutation-read` | Discover immutable Decomposition keys plus the complete explicit External blocker set as the mutation preflight; create or reuse exact canonical child Issues; or replace one approved unfinished child only from its exact old body/version, completed prior Decomposition, and absent execution-lane evidence. |
| `relation-read`, `relation-publish`, `relation-mutation-read`, `partial-relations-read` | Read or publish only native `is_blocked_by` evidence when configuration declares `native`; parent and body-mode blocker relations are not native-link writes. |
| `decomposition-read`, `decomposition-publish` | Read or append one immutable `decomposition:v1` note after the complete child and blocker graph passes read-back. |
| `ready-read`, `ready-write` | Read or apply only the existing ready label state derived from open blockers, then return the complete frontier. |
| `handoff-read`, `handoff-append` | Read or append the composite handoff bound to the upstream records, current transaction, Decomposition note and ready-state receipts. |

Mutation intents contain payload hashes and operation identities rather than Issue bodies or credentials. Every write uses immediate owner read-back. A rejected or unresolved native blocker write records the exact child, Decomposition key, expected edge, request result, and relation read-back as `ABSENT`, `PRESENT`, or `UNKNOWN`. It never changes representation automatically. Before `decomposition.read_back`, the same transaction may resume under newly configured `body` only when every retained relation read-back is exact `ABSENT`, all children and body edges match, no native blocker exists, and no Decomposition record has been published. `UNKNOWN` evidence remains fail closed and is never blindly retried.

GitLab notes are editable, so downstream reads verify both native note identity and exact body digest. Only records authored by a current project Developer or higher are accepted. The body graph and `decomposition:v1` record remain dependency authority in both representations; native blocking evidence is additional only in `native`.

An unchanged closed child enters a revised Decomposition only through the six-field `adoptedCompletions` evidence defined by the shared payload contract. The binding re-reads the previous Spec publication, completed Decomposition transaction and handoff, latest exact completion note, unchanged child body and incoming blockers, integrated candidate, absent registered worktree/topic, and absent old Run ownership before publishing. A missing or conflicting adoption stops without changing the child. Completed handoff reads use their frozen ready-state receipt, so later child lifecycle changes do not invalidate them.
