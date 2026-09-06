---
status: accepted
---

# Bound explicitly selected batches and preserve each Run

Each Spec Run retains its immutable Grant and `max_parallel`. A human may explicitly select a batch of Specs; the active installed coordinator observes every selected Run before dispatch, applies a shared batch worker bound and each Run bound, then gives dependency-ready lanes one action per round in rotating order. Before allocating any slot, each Run discovers native tasks for its unjournaled creation intents: one proven lane is adopted into its dispatch journal, while ambiguous or unread activity reserves capacity. Existing workers and uncertain task activity reserve capacity; closeout and lock observation use no execution slot. Blocked lanes do not suppress independent selected lanes.

The batch is an in-process scheduling scope, not a repository-wide or machine-wide pool, durable FIFO queue, daemon or global service. Unselected Specs never start. A recovered batch rebuilds activity from journals and native tasks instead of trusting its old projections. Close leaves retain their existing repository lease and target writer; neither batch scheduling nor capacity accounting acquires those leases.
