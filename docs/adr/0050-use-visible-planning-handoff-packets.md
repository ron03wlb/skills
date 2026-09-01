---
status: accepted
---

# Use visible planning handoff packets

When `grill-with-docs` reaches shared understanding, it emits one user-visible **Planning handoff packet** binding the target and baseline to every accepted glossary term, ADR decision, exact path or hunk, and expected content identity, then stops for the human to invoke `to-spec`. The same task may consume that packet directly; a fresh task requires the packet or renewed human scope confirmation, and `to-spec` revalidates every bound Git identity before creating the **Planning Seal**. We chose this over a hidden Git-common-dir planning journal because explicit invocation and a visible packet provide the required ownership proof with less persistent state, while a missing, mixed, or mismatched handoff still fails closed instead of treating the dirty tree as authority.
