# Parent closeout

Read this reference only when the bound target is a Multi-Issue parent.

A Multi-Issue Spec has no implementation candidate or Issue worktree. Require its matching read-back Decomposition publication record, exact child mapping, common recorded target branch, and current tracker state. Prove every exact child is closed and every unchanged completed child candidate reachable from that same target. Missing, unreadable, stale, duplicate, or conflicting publication evidence stops and returns to `/to-tickets <Parent-ID>` reconciliation; never infer completeness from visible children or use a legacy bypass.

Only then close and read back the parent. Final-child closure never closes its parent implicitly; parent closure never claims `push_ready` or runs aggregate verification.
