# Boundary-first grilling observations, 2026-09-10

Candidate: WIP against `4cccf106eacdd2a2c098786b87a95d9213959454` on `features/ron`, task `01a08a94-e29a-7843-a66c-e79ae4bb7669`. No candidate commit or publication was created. The initial worktree was clean.

## Model rehearsals

No fresh isolated model rehearsal was run in this task. The ordinary-detail, persistence-boundary and coherent-SQL-package cases in `grilling-scenarios.md` are expected dispositions only and remain unverified model behavior. Structural wording and passing tests cannot establish fewer questions, lower latency or lower token use.

## Evidence and question sources

- The human reported that the current grill still exposed too many detailed decisions and approved a boundary-first policy: ordinary business detail follows the project or established practice, while table boundaries and major directions remain the primary questions.
- GitHub Issue #962 distinguishes user-facing behavior decisions from implementation terminology.
- GitHub Issue #1015 argues that grilling should preserve semantic ownership, identity, lifecycle and authority boundaries without prescribing every implementation choice.

## Automated checks

- `node --test tests/ron-workflow/grilling-contract.test.mjs` passed 3/3 with zero failures and zero skips after the boundary-first contract assertions were added.
- The full `skill-contracts.test.mjs` run passed 47/48 checks; its only failure was the router at 702 words against the 700-word budget. After shortening the changed route to exactly 700 words, the focused Router and Operational Skill budget gate passed 1/1.
- The final full `skill-contracts.test.mjs` rerun passed 48/48 with zero failures and zero skips in 183350 ms, including promoted packaging parity, dependency loading, planning isolation and local Git integration fixtures. Its temporary push fixtures targeted repositories under `%TEMP%`, not this workspace remote.
- No fresh model rehearsal was inferred from these structural results.
