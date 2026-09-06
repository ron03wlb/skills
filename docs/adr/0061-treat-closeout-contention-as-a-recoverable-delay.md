---
status: accepted
---

# Treat closeout contention as a recoverable delay

Healthy closeout-writer contention places the affected coordinator lane in `WAITING_FOR_TARGET_WRITER` while independent legal Issue actions continue. Each observation yields back to scheduling; thirty seconds is not a human retry boundary. Waiting consumes no Issue execution slot and no Issue retry attempt.

After the competing writer releases, the coordinator reacquires the exact immutable authority, candidate and completion evidence while refreshing normal target HEAD, dirt and close progress and asks `close-issue` to acquire the applicable closeout writer itself. A missing health proof, unknown owner, or changed authority produces a recoverable `BLOCKED` closeout with preserved progress and explicit Resume predicates. It is not an Issue implementation failure, and unrelated Issue execution or Spec Runs continue.
