---
status: superseded by ADR-0022
---

# Issue tracker is the authorization system of record

Development authorization is recorded as append-only structured comments on the exact Issue, rather than inferred from a plan, label, conversation, or repository file. This adds tracker availability and read-back gates, but provides one revocable cross-session authority chain while keeping product specs focused on intended behavior.

One bounded lifecycle authorization may explicitly bind a fixed ordered set of Leaf Issues under a Parent. It does not authorize other children implicitly; only a Repair Leaf contract derived from that exact Parent authorization may reuse its unchanged Spec, target branch, Lane, exclusions, and an owned-path subset. If the current chain, bound hashes, or revocation state cannot be verified, execution fails closed.
