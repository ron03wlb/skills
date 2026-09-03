---
status: accepted
---

# Treat closeout contention as a recoverable delay

Healthy closeout-writer contention places the affected coordinator lane in `WAITING_FOR_TARGET_WRITER` after it has dispatched every currently legal Issue action. Waiting consumes no Issue execution slot and no Issue retry attempt.

After the competing writer releases, the coordinator reacquires the exact authority evidence and asks `close-issue` to acquire the applicable closeout writer itself. A timeout, unknown owner, or changed evidence produces a recoverable `BLOCKED` closeout with preserved progress and explicit Resume predicates. It is not an Issue implementation failure, and unrelated Issue execution or Spec Runs continue.
