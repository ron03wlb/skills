---
status: accepted
---

# Share one Issue worktree across prerequisite preparation and execution

`pre-execute-issue` performs initial discovery without creating a worktree. Only `REQUIRED` creates or reuses the dedicated Issue worktree and topic branch; `NOT_REQUIRED` and discovery-time `BLOCKED` stop without one. After repository validation passes, the prerequisite artifact is committed alone and the worktree is left clean before `WAITING_MANUAL`; later `execute-issue` must reuse the same branch, worktree, and candidate ancestry rather than copying the artifact into a second execution lane.
