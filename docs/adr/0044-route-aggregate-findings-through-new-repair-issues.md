---
status: accepted
---

# Route aggregate findings through new repair Issues

When aggregate target review discovers a **Confirmed code review finding** after the contributing Issues are integrated and closed, correction defaults to a new **Aggregate repair Issue** targeting the same branch and binding the exact finding plus affected Issue and Spec identities. The verifier reports the blocker but never creates or executes the repair, prior Issues and completion notes remain unchanged, and only explicit human direction may reopen an earlier Issue; this preserves immutable delivery history and gives every aggregate correction one unambiguous owner.
