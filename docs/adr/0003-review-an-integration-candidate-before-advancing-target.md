---
status: superseded by ADR-0021
---

# Review an integration candidate before advancing target

Parent and Standalone closeout first synchronizes the latest target into the Execution Lane, reconciles the Wiki, and freezes a Target Integration Candidate. The final full review runs against that exact SHA before the local target branch fast-forwards to it. This adds one candidate boundary but avoids moving target to an unreviewed aggregate, preserves completed Leaf commit identities, and makes the reviewed tree identical to the integrated tree.
