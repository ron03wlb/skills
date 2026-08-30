---
status: superseded by ADR-0039
---

# Keep prerequisite receipts append-only and minimal

Canonical prerequisite receipts are limited to append-only `WAITING_MANUAL` and `READY` tracker comments or notes, including the `## Comments` history of a Local Markdown Issue. `NOT_REQUIRED`, `REQUIRED`, and `BLOCKED` remain transient resolver results and create no empty or failure receipt. Each recovery-relevant transition is written and read back once; stable Spec and policy selection stay in the Issue body, and repository-local state may assist recovery but never grants readiness. The receipt performs only the identity checks needed to reject stale manual-action evidence—no periodic polling, duplicate validation layers, or generic receipt engine—so prerequisite safety does not outweigh the implementation it protects.
