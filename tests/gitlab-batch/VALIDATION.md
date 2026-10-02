# GitLab batch trial validation — 2026-10-02

Status: **程式待實測驗收 / implementation awaiting real-platform acceptance**. P0/P1 code and local regressions are implemented; first-version completion and production readiness are **not** claimed.

## Current implementation evidence

Environment: Linux toolchain in WSL; Git 2.43.0. Tests were rerun on Node **24.21.0** and **22.19.0** (cached ephemeral npm runtime; its directory was prepended to PATH for child Node commands). No repository manifests were changed.

Tested source fingerprint: `49bac47f20d3d2df1388faaa9c73a9eab4a46c843e9d168d9067d5665da1309c`.
This SHA256 covers 28 files under `skills/in-progress/gitlab-batch/` and `tests/gitlab-batch/`, excluding this file: sorted repo-relative paths, each followed by NUL, file bytes, NUL. It identifies the uncommitted source, not a release or approval. The table preserves observed results; `/tmp` logs are local temporary evidence, not shipped artifacts or remote CI receipts.

| Item | Platform | Versions | Command / operation | Date | Result | Evidence source | Limits |
|---|---|---|---|---|---|---|---|
| Batch regression | Linux/WSL | Node 22.19.0, Git 2.43.0 | `node --test --test-reporter=tap tests/gitlab-batch/*.test.mjs` | 2026-10-02 | **80 passed, 0 failed**, exit 0 | `/tmp/gitlab-batch-node22-batch.log`; source fingerprint above | Temporary Git repos; mocked GitLab/Orca/reviewer/TUI; not real adapter acceptance |
| Batch regression | Linux/WSL | Node 24.21.0, Git 2.43.0 | Same command | 2026-10-02 | **80 passed, 0 failed**, exit 0 | `/tmp/gitlab-batch-node24-batch.log` | Same limits |
| Existing skill contracts | Linux/WSL | Node 22.19.0 | `node --test --test-reporter=tap tests/ron-workflow/skill-contracts.test.mjs` | 2026-10-02 | **52 passed, 0 failed**, exit 0 | `/tmp/gitlab-batch-node22-contracts.log` | Packaging/routing contracts, not product E2E |
| Existing skill contracts | Linux/WSL | Node 24.21.0 | Same command | 2026-10-02 | **52 passed, 0 failed**, exit 0 | `/tmp/gitlab-batch-node24-contracts.log` | Same limits |
| Real Pi resource/schema smoke | Linux/WSL | Pi 1.0.0; Node 22.19.0 and 24.21.0 | `node tests/gitlab-batch/pi-load-smoke.mjs --pi-root <installed-pi-coding-agent-package>` | 2026-10-02 | Exit 0 on both: one skill, one next command, one checkpoint tool; real validator accepts checkpoint and refuses integrate | `pi-load-smoke.mjs`; `/tmp/gitlab-batch-node{22,24}-pi-load.log` | No session/model/tool execution; **not** TUI switching or real independent review |
| Local disposable fixtures | Linux/WSL | Node 22.19.0 and 24.21.0 | `scratch.test.mjs` within batch suite | 2026-10-02 | Generated separate single/multi repos/plans; expected-red seeded tests pass after local fixture implementation | `create-scratch.mjs`, `scratch.test.mjs` | No tracker publication, Orca registration or lifecycle; does not grant mutations |
| Active diagnostics | Local LSP | Inferred JS/TS settings, not a project tsconfig | `lens_diagnostics source=lsp` for 16 changed JS/TS files, followed by runtime/extension re-probe | 2026-10-02 | No errors; inferred step-option warning fixed with JSDoc; follow-up shows no warnings but both files inconclusive | Active tool responses; `runtime.mjs` step contract | Initial scan: 12 clean, 4 with findings (hints plus inferred warning); later silent-on-clean servers do **not** prove blanket clean. Style/unused hints remain |
| Whitespace | Local Git + Node | Git 2.43.0, Node 24.21.0 | `git diff --check`; trailing whitespace/newline scan of all 28 untracked source/test files | 2026-10-02 | Exit 0; no whitespace/newline findings | Local command and source scan | `git diff --check` alone excludes untracked files, hence separate scan |
| Packaging preservation | Repository | Current WIP | Skill contracts + working-tree inspection | 2026-10-02 | Remains in-progress; promoted manifests, release flow and immutable linker untouched | `recovery.test.mjs`; Git status | Existing router/docs/index WIP retained; no commit or push |

New regression coverage includes full single-root plans, child execution metadata, per-member acceptance/integration evidence, linked root summaries, partial multi-destination recovery, lost note read-back, original legacy pending authority, refusal to silently upgrade running descriptions, segment/context edit/write/bash guards, controlled checkpoint/sync, parallel read-only metadata observation, retained high-water across compaction, valid blocked-owner repair, bounded summary/full/preview output and the whole-handoff 4 KiB budget. Existing ownership, fingerprint, cancellation, prepared-commit, revision, restricted-review, FF/closure/cleanup recovery and zero-push tests remain passing.

## Real acceptance blockers (not substituted by mocks)

| Item | Platform | Required versions / operation | Date assessed | Result | Evidence source / missing evidence | Limits / unblock action |
|---|---|---|---|---|---|---|
| CI baseline | Ubuntu + macOS | Node 22.19; batch + skill-contract jobs | 2026-10-02 | **Not verified** | `.github/workflows/gitlab-batch-tests.yml` only; no run URL/result | Configuration is not execution. Obtain real run URLs; no CI/release changes or push performed |
| macOS interaction | macOS | Supported Node/Pi/glab/Orca; explicit resource paths | 2026-10-02 | **Blocked: no macOS environment** | No native execution receipt | Run baseline and full scratch checklist on macOS |
| Same-terminal Pi handoff | Linux/WSL + macOS | Actual TUI next/cancel/pending-message/initialization-failure/old-owner refusal | 2026-10-02 | **Not verified** | Mock contexts and load/schema smoke only | Needs approved scratch terminal operations; record actual IDs, generation, transcript absence and fingerprints |
| Orca lifecycle | Linux/WSL + macOS | Real create/re-entry/terminal launch/identity read-back/cleanup | 2026-10-02 | **Blocked: no specific scratch mutation grant** | Earlier help discovery only | Grant exact disposable repo and operations; capture actual CLI schema/receipts |
| GitLab publication and progress | Disposable project | Single/multi publication, member notes/read-back/partial sync recovery | 2026-10-02 | **Blocked: no named disposable project grant** | No current real tracker writes | Grant exact project and allowed Issue/notes/closure actions; retain separate confirmation tokens |
| Real restricted reviewer | Linux/WSL + macOS | Fresh Pi processes, fixed T/C/shards and read-only tools | 2026-10-02 | **Not verified** | Reviewer transport is mocked in tests | Needs approved scratch batch and available model credentials; load smoke is not model review |
| Whole-batch closeout | Linux/WSL + macOS | Two domains/two sessions/one worktree; confirmed local FF, notes/closure, Orca removal; zero push | 2026-10-02 | **Not verified** | Local mock E2E only | Complete actual scratch lifecycle and record candidate/target, tracker URLs and cleanup receipts |

The reproducible fixture command, exact authorization boundary and per-platform operations are in [contracts](../../skills/in-progress/gitlab-batch/references/contracts.md). Public batch operations remain one skill; the new controlled tool and smoke/fixture scripts are not new skills, a runner service, or integration authority. Product `spay2` stays read-only. This implementation request did not authorize disposable remote objects, Orca terminal prompts or product integration, and none was performed.

## Earlier-agent evidence (historical, not rerun here)

The previous validation record reported 60 batch tests and 52 skill contracts passing on Node 22.19, a Pi 1.0.0 RPC command-registration smoke, Orca `orca-ide` 1.4.218 guide/help capability discovery, and read-only `spay2` origin/project read-back with glab 1.36.0. It also reported successful maintainer linking with reserved `run-issue-workflow` links unchanged. Those earlier receipts were recorded in this file but are not fresh mutation/lifecycle evidence; the linker and product/Orca preflight were not rerun in this implementation turn.
