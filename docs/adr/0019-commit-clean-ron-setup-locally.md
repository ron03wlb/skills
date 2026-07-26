---
status: accepted
---

# Commit clean Ron setup locally

Direct `/setup-ron` invocation may carry a bounded clean-path delegation for one exact local configuration change. After inspection and validation, setup writes only the approved Ron configuration and instruction paths, verifies the exact diff, creates one local setup commit, and fast-forwards the named local target to that commit.

If the target checkout is dirty with overlapping work, setup uses an isolated worktree when it can do so without ambiguity. Dirty overlap, unexpected paths, merge conflict, failed tracker capability proof, failed config validation, or target drift outside a clean fast-forward refresh stops and presents the problem and trade-offs.

The setup commit never includes product changes, Wiki baseline content, unrelated formatting, push, remote merge, deployment, branch deletion, live-provider action, or legacy-data deletion. `/wiki` trusts the operational contract only after the local target contains and verifies this commit.
