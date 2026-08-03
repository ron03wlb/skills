---
status: accepted
---

# Issue tracker is the authorization system of record

Development authorization is recorded as append-only structured comments on the exact Issue, rather than inferred from a plan, label, conversation, or repository file. This adds tracker availability and read-back gates, but provides one revocable cross-session authority chain while keeping product specs focused on intended behavior.

Batch approval may create separate records for a fixed set of Leaf Issues, but authorization never cascades implicitly from a Parent. If the current chain, bound hashes, or revocation state cannot be verified, execution fails closed.
