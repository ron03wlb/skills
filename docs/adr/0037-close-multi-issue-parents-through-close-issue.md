---
status: accepted
---

# Close Multi-Issue parents through close-issue

`/close-issue <Issue-ID>` dispatches by Issue shape. An **Executable Issue** merges its unchanged completed candidate into its recorded target, removes its clean worktree, and closes the Issue without a custom closeout receipt. A **Multi-Issue Spec** has no implementation candidate or worktree, so its parent path performs no integration: it requires the matching read-back **Decomposition publication record**, proves every exact child is closed and every candidate is reachable from the same target, then closes and reads back only the parent. A missing, unreadable, stale, or conflicting record stops and returns to `/to-tickets <Parent-ID>` reconciliation; visible children never imply completeness and no legacy bypass is allowed. Closing the final child never closes the parent implicitly, and parent closure does not claim aggregate `push_ready`. We use this explicit parent mode instead of making `/to-tickets` close Issues or adding a separate `/close-spec` command, preserving an intuitive closure interface without mixing the two paths' invariants.
