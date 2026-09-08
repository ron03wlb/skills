# Issue 73: Windows host release boundary

**Goal:** Preserve exact ordered closeout when Windows retains an owned worktree directory and the host cannot safely release its helpers.
**Why planning is required:** High-risk host ownership, filesystem cleanup and tracker-ordering contract.
**Acceptance:** Issue 73 AC-1 through AC-4; supported capability must be evidenced before use. Unavailable release leaves the integrated candidate, completion, topic, pending directory and OPEN tracker intact; release target then repository leases. Policy rejection, running or unknown tasks and linked/nonempty paths stop without alternate cleanup. No push, installation, process termination, integration or Issue closure in this execution lane.

Execution uses the existing task `01a07ee1-b369-74f2-9c1a-aff8986acaaf`, worktree `C:/Users/ron.chang/.codex/worktrees/76a4/skills`, topic `codex/issue-73-windows-host-release`, and baseline/Planning Seal `0dd5111da99b2a719b8085ef76be0c2818e95e1a`. The Git-common-dir Grant binds Spec 72, child `72/01`, target `features/ron` and package `db130a91219ef4df4a7339b0a6c3b9149b6fc66692768ce32be656f0529bda37`. No Manual prerequisite is declared.

### Outcome 1: Truthful capability boundary
- Work: Inspect exposed desktop tools, bridge and official lifecycle documentation. Record supported release and ownership/respawn guarantees, or explicit unavailability. Archive/handoff semantics alone do not prove release of exact helpers.
- Verify: Read-only Windows task/tool observations and `docs/agents/workflow-windows-evidence.md`; no inferred process API.

### Outcome 2: Exact pending-cleanup continuation
- Work: Add a read-only close-owner helper to preserve failed directory observations and return a concrete host blocker. Keep existing repository-close then target-writer acquisition and reverse release. Recheck exact completion, task, path, topic, Git ancestry and physical state; ordinary empty-directory removal remains in the existing close owner. Integrate the unavailable result into source reconciliation and the existing same-task continuation without implementation replay or blocking independent siblings.
- Verify: `node --test tests/ron-workflow/close-continuation.test.mjs tests/ron-workflow/windows-lease-release.test.mjs` plus affected owner/source tests. Cover active/foreign/unknown task, linked/nonempty paths, changed ownership, sharing failures, policy rejection, stale results, preserved completion/OPEN tracker and lease release.

### Outcome 3: Reviewable Windows limitation evidence
- Work: Record live capability and before/after observations separately from deterministic fixtures. Preserve earlier helper/respawn failures. No installation is necessary for a read-only unavailable-capability probe; leave installed GitLab contributions and retained Run packages intact.
- Verify: Required focused checks, syntax checks for changed JavaScript (no configured typechecker), repository `node --test tests/ron-workflow/*.test.mjs`, final diff, independent pinned Standards/Spec review, clean committed candidate and one completion-note read-back. Use the execution-owned verification cache only with freshly validated candidate inputs.
