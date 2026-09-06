---
status: accepted
---

# Wait for closeout without a durable queue

Repository closeout serialization uses one atomic repository close lease plus bounded observation and retry. It adds no durable FIFO queue, daemon, global scheduler, waiter registry, or queue-specific reclaim protocol.

When the lease is occupied, a contender records the exact observed owner and enters the recoverable closeout wait defined by ADR-0061. After release, each contender reacquires its authority evidence before asking `close-issue` to atomically acquire the lease. One leaf wins; other contenders keep waiting. Correctness never depends on acquisition order, and strict FIFO fairness is not promised.

A healthy owner remains waitable across bounded observation windows. A resumed coordinator continues the same journaled wait and honors its latest control revision; elapsed time neither blocks progress nor permits reclaim. Unproven liveness or changed authority preserves the affected closeout for owner reconciliation. Waiting consumes neither `max_parallel` execution capacity nor an Issue retry, and it never permits duplicate closeout.
