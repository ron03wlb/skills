---
status: superseded by ADR-0078
---

# Reimplement Issue 91 for WSL

Issue 91's Windows-specific qualification is replaced for this repository by a WSL2 Ubuntu x64 qualification. This decision is the accepted local requirement amendment for Issue 91. It supersedes only that Issue's platform, cleanup, installed-entry, and evidence clauses. The Issue's existing recovery, immutable-package, truthful measurement, bounded payload, independent review, and no-duplicate-effect requirements remain in force.

The implementation runs entirely in the WSL Linux runtime. It must not invoke PowerShell, `pwsh`, `powershell.exe`, `cmd.exe`, Windows process APIs, Windows path translation, or a Windows checkout. Checkpoint and control files use validated absolute POSIX paths. Their writer and reader use Node or POSIX shell operations with atomic publication and the same fail-closed treatment of an uncertain write or malformed control.

Windows helper-lock recovery is not ported as process termination. POSIX directory removal is attempted normally because an open current directory does not create the Windows sharing-lock condition. A failed removal remains `HOST_CLEANUP_BLOCKED` with the observed error and owning closeout boundary. The workflow must not inspect arbitrary processes, infer ownership from a PID, or terminate a process as a cleanup fallback.

Installed qualification binds the exact immutable package, fixture revision, Linux runtime and observable WSL capabilities. It runs the package-owned WSL qualification three times, retains every result and timing, and reuses unchanged evidence only when package, fixture, runtime and capability inputs still match. It must distinguish component fixtures, installed WSL behavior, and native task behavior. This harness has no native Codex task API, so its fixture evidence must not claim native Codex task execution, tracker mutation, or unattended delivery.

The reimplementation preserves the existing compact receipt, recovery, close identity, bounded response, no-full-history-on-normal-completion, and delivery-progression contracts. It adds focused WSL tests for POSIX checkpoint/control paths, atomic publication, malformed-control failure, ordinary worktree removal while a child holds that directory, immutable-package qualification, fixture identity invalidation, and three retained qualification observations. It updates the affected skill instructions, operator guidance, evidence document, and closeout documentation to describe this boundary accurately.

Completion requires focused WSL tests, `node --test tests/ron-workflow/*.test.mjs`, `git diff --check`, and independent Standards and Spec review. The evidence records exact commands, package and fixture identities, Linux runtime/capabilities, every observed timing or unavailable metric, and the boundary that native Codex task effects were not exercised. It does not authorize tracker mutation, task creation, push, deployment, or changes outside Issue 91's implementation.

Source basis: direct human instruction, 2026-09-15.
