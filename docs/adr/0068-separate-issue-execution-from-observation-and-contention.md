---
status: accepted
---

# Separate Issue execution from observation and contention

Spec #84 and its executable Issue #87 inherit the human-confirmed decision that one Issue operation owns a cumulative active-work budget across implementation, conflict repair, and their verification and review. Retries, task replacement, transport restart, and same-command re-entry retain consumed time; verified healthy dependency or writer contention is excluded, and uncertain elapsed evidence remains explicit without granting additional execution.

The DAG run journal therefore records only the minimal execution starts, monotonic or native observations, uncertainty, and exhaustion needed to reduce that Issue-owned budget. Observation waits and bounded fault recovery yield at the remaining execution boundary, while late outcomes retain the original task, worktree, candidate, and receipts. This refines ADR-0040's journal contents without making task state a journal-owned fact or authorizing cancellation, lease theft, competing writers, push, or deployment.
