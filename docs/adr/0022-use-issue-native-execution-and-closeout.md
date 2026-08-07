---
status: accepted
---

# Use Issue-native execution and closeout

Retain `execute-issue` and `close-issue` as an explicit alternative within Matt's existing Issue flow. Ordinary `to-spec` and `to-tickets` create the tracker work and `/implement` remains the default implementation step. When the user explicitly selects the worktree alternative, each dependency-ready Issue is implemented in its own worktree, reviewed for Standards and Spec, and repaired for at most ten waves by `execute-issue`; a separately invoked `close-issue` refreshes and fast-forwards the original local branch, removes the clean worktree, and closes the Issue.

Remove `ask-ron`, `to-spec-ron`, `to-tickets-ron`, and their hashed contract and lifecycle-authorization envelopes. Direct invocation covers one local execution or closeout, a human serializes target integrations, and a plain tracker completion note hands the reviewed candidate between the two skills. This gives up machine-verified authorization lineage in exchange for the smaller Issue-native flow while retaining clean-worktree checks, exact Git identities, separate Standards/Spec review, and exclusions for push, remote merge, deploy, and unrelated deletion. `/wiki` and `/remove-ron` remain independent controls.
