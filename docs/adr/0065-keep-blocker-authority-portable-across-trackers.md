---
status: accepted
---

# Keep blocker authority portable across tracker capabilities

`to-tickets` treats directed blocker edges as tracker-independent scheduling authority. A tracker adapter uses native blocking relations when it can publish and read them back; when it cannot, the canonical child's `## Blocked by` references and the parent's `decomposition:v1` record carry the exact same edges. Issue labels may project blocked or ready state and `relates_to` may aid navigation, but neither is dependency authority. We chose this over requiring native `blocks` or encoding Issue IDs into labels so trackers without native blocking remain usable without losing edge identity, acyclicity, recovery, or frontier computation.

GitLab defaults to the body representation unless repository configuration explicitly declares native blocking before mutation. Capability discovery never creates a relation, and a declared-native write or read-back failure remains a Recoverable blocker; the adapter never treats a generic HTTP 400 as proof that native blocking is unavailable or silently downgrades the representation.

Body representation creates no `relates_to` link. The canonical `## Blocked by` references already provide navigation, while another tracker mutation and receipt would add failure and recovery surface without adding scheduling authority.

An incomplete operation may adopt a newly configured body representation only before `decomposition.read_back`, when its exact child identity, Decomposition key, canonical body, and blocker edge match and no conflicting native relation or `decomposition:v1` record exists. The same `/to-tickets` retry preserves the transaction and existing children; an HTTP 400 alone never authorizes adoption, and every completed-stage or evidence conflict remains fail closed.

The fallback introduces no `blocked` label. `ready-for-agent` remains the only ready-state projection, and exact blocked state is derived from the published edges so label lifecycle cannot drift from scheduling authority or spread compatibility logic into the Run coordinator.

The adapter adds no method, checkpoint stage, or producer profile. Existing `tracker.discoverChildren` read-back declares `blockingRepresentation` as `body` or `native`; `tracker.publishRelation` remains native-only and is called only for `native`, while `tracker.publishChild` writes and the ordinary Issue read-back verifies body edges. `decomposition.read_back` continues to bind logical blocker edges rather than a tracker link identity.

New GitLab configuration writes `Blocking representation: body` without another setup question or mutation probe, while a repository with proven native support may explicitly select `native`. An existing GitLab configuration with no value is `UNKNOWN` and stops before mutation with a one-line `body` or `native` repair; it never silently changes an existing partial operation's representation during a Skill upgrade.

Every tracker uses the canonical child `## Blocked by` section: one stable Issue reference per bullet in canonical tracker-identity order, or exactly `None.` when empty, with no title or status prose. Body mode reads that section back exactly instead of parsing arbitrary text; native mode retains the same body and treats the native blocking relation only as an additional supported identity source.

This change is scoped only to blocking relations. Parent and sub-issue publication, read-back, and recovery retain their existing contract; a proven hierarchy-capability failure requires a separate decision instead of adding a speculative `parentRepresentation` or body-authoritative hierarchy semantics.
