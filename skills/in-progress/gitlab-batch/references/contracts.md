# GitLab batch v1 contracts and validation

This independent experiment defines **BatchPlan**, **BatchRuntime** and **Handoff** only inside `gitlab-batch:v1`. They are not the existing repository's Spec, Run, Planning Seal, Grant, contribution or completion-evidence records. ADR-0081/0082 continue governing the existing Run/project-binding owners; this experiment neither reads/writes their binding file nor replaces their adapters or setup/install flows.

## Stores and identities

| Source | Owns |
|---|---|
| GitLab | Confirmed Issue specifications, ordinary parent/member list, progress and local-integration notes |
| Git | Baseline, accepted commits and fixed target/candidate versions |
| Orca | Complete worktree ID, immutable identity key, repo ID, path and branch; terminal handle/receipt |
| Git common directory `/gitlab-batch/` | Workstation-local drafts, versioned plan hash, runtime, operation journals, locks, evidence and handoffs |

The script discovers common directory with Git and resolves real paths. No runtime artifacts are product commits. Atomic writes use a sibling exclusive temporary file, fsync, rename and directory fsync. An operation lock is an atomic directory (`locks/batch-<id>`); the aggregate integration lock is `locks/repository-integration`. There is no automatic expiry takeover. After abnormal exit, inspect its owner evidence, verify the exact former operation is inactive and obtain human confirmation before removing **only that lock**. Do not delete batch state or ambiguous operation journals. PID checks are hints, not session identity.

State transitions: `draft → ready → running → handoff_ready → running → awaiting_integration → done`, with recoverable `blocked`. A plan revision returns to `draft`. One effective owner is `{session,generation}`; generation increases on handoff/takeover. Old generations fail execution operations. A new session consumes one content-bound handoff ticket, not the old transcript. The state is single-workstation: hostname/path/Orca identity mismatch stops; cross-machine lock sharing and live migration are out of scope.

GitLab metadata explicitly identifies `single`, `parent` or `child`, root IID, project ID, batch ID and revision. All member titles/descriptions are hash-checked before mutations; tracker text cannot expand confirmed scope. Operation markers are per batch/action. Creates are journaled before dispatch and located by marker before retry; an absent marker after an attempted create is an unresolved outcome, not permission to duplicate it. PUT/read-back, checkpoint synchronization, closure and cleanup each have resumable progress.

Handoff includes exact commit, index/worktree binary diff fingerprint and content/mode hashes for untracked/dirty files, plus completion, unfinished work, verification, blocker, decisions and next step. Dirty submodules cannot be silently fingerprinted as ordinary files. Unaccepted work is preserved on disk; no reset, stash or forced unaccepted commit is part of recovery.

## Platform preflight

Support macOS, Linux and WSL using Linux Node/Git/Pi. Require Node.js ≥22.19. Native Windows, remote Orca execution hosts, multiple writers and cross-machine state migration are unsupported.

Use Node standard libraries and spawn argument arrays. No NVM paths, hard-coded home directories, GNU utilities, `/proc`, Bash 4, `flock` or shell-string CLI transport. Spaces/Unicode paths are tested. The Orca terminal command is POSIX-quoted because Orca's terminal API accepts command text; direct subprocess adapters still use argument arrays. WSL UNC paths are converted only for the matching `WSL_DISTRO_NAME`, then realpath-checked.

Select Orca once:

1. `ORCA_CLI_COMMAND` if present (one executable, not a command plus arguments).
2. `orca-dev` when `ORCA_DEV_REPO_ROOT` is exposed.
3. Linux outside a managed terminal (`ORCA_TERMINAL_HANDLE` absent): `orca-ide`.
4. Otherwise `orca` (including macOS).

Selected executable failure stops; never fall through, especially to Linux GNOME's screen reader. Read its `skills get orca-cli --json`, then help-check worktree create/list/reuse, terminal create/wait/send and cleanup capabilities. Production never falls back to `git worktree add`. A missing/running-host error is reported; starting another Orca host is a human operational decision, not an automatic fallback.

`doctor` is read-only. With an explicit binding JSON it compares the unique origin URL, full project path and freshly read numeric GitLab project ID. HTTPS/HTTP origins and SSH clones are supported; an SSH clone requires the explicit HTTP(S) origin. It reports discovered versions, not an assertion that production integration has been smoke-tested.

## Tests and smoke

From the repository root:

```bash
node --test tests/gitlab-batch/*.test.mjs
node --test tests/ron-workflow/skill-contracts.test.mjs
```

The CI configuration targets Ubuntu and macOS with Node 22.19, temporary Git repos, fake GitLab/Orca/Pi transports and mock extension contexts. It requires no tracker/Orca credentials. Node tests exercise mock registration/lifecycle and the handoff controller. For the real installed Pi's resource loader and tool schema, run `node tests/gitlab-batch/pi-load-smoke.mjs --pi-root <installed-pi-coding-agent-package>`. This registers only this skill/command/tool, accepts checkpoint parameters and refuses integration parameters without creating a session or contacting a model. Neither mock transport nor load/schema smoke is a real Orca/interactive-session/reviewer integration test.

### Reproducible disposable fixtures

After the human names a disposable GitLab origin/project path/numeric ID, prepare a credential-free `binding.json` with exactly those three fields. From this repository root:

```bash
node tests/gitlab-batch/create-scratch.mjs --binding /absolute/path/binding.json
```

This creates two local temporary Git repos and plan files **outside their checkouts**: one single Issue and one two-domain/two-segment batch. Tests start red by design; payment validation and reconciliation are the small implementation tasks. The generator makes local fixture commits only, calls no external adapter and never pushes. It does not register Orca repos, publish plans or authorize later mutations. Re-run for unique batch IDs; do not reuse a completed batch. Keep the printed fixture root until evidence is captured, then explicitly clean remaining local fixtures.

Obtain a specific grant naming disposable project, fixture paths and allowed Issue creation/notes/closure, Orca registration/worktree/terminal prompts/cleanup and local FF. Retain separate publish/start/integrate confirmations. Product `spay2` remains read-only. Execute each fixture from its target checkout with explicit `--skill`/`--extension` paths; use `doctor --input <binding-file>`, `plan --input <single-or-multi-plan>` and the normal public operations. No test runner, daemon or permanent service is added.

### Evidence checklist (repeat on macOS and Linux/WSL)

Record each row in [VALIDATION.md](../../../../tests/gitlab-batch/VALIDATION.md): date, platform, tool versions, exact command/operation, result and durable evidence source. Mark fault-injected cases as such.

1. **Baseline**: Node 22.19 tests and skill contracts; record actual Ubuntu/macOS CI run URLs, not the workflow definition as success.
2. **Orca**: capability/version preflight, actual create schema and complete ID/identity/path/branch, repeat start/re-entry retains exactly one worktree/terminal, actual terminal launch. No raw-Git fallback. Capture receipts without credentials.
3. **Single GitLab**: publish one Issue with no parent; read back complete plan, target, segments and aggregate commands. Acceptance note lives on that Issue with criterion/command results and its commit.
4. **Multi GitLab**: parent contains complete plan, children their specs/target/segment/parent. Each accepted child gets its own evidence; root gets evidence links. Use an explicitly approved temporary glab fault wrapper to reject the second destination's notes GET *before dispatch* while delegating other calls to the captured real executable. Save queue position, remove fault, sync and read back: first note occurs once, only remaining destinations retry, begin remains blocked until then. A lost POST without a matching marker requires human reconciliation, not blind resend.
5. **Pi TUI**: checkpoint an unfinished dirty Issue; record HEAD/fingerprint. Pause/cancel next and verify generation/fingerprint unchanged. Queue a message during confirmation and verify switching is refused. Select new session in the same terminal; record old/new session IDs, generation, parent link and absence of inherited transcript. Resume the active Issue, not a new begin. Use an approved test-only initialization failure to verify checkpoint retention; remove it before confirmed recovery. Old generations cannot write. At 60% no new begin; at 70% and segment end edit/write/bash are refused but controlled checkpoint/sync work. Record actual context/high-water (including compaction); do not fabricate a budget.
6. **Aggregate E2E**: multi fixture runs both domains in two sessions and one shared Orca worktree. Complete all acceptance, checkpoint, then from target checkout run actual restricted fresh Pi reviewers; record fixed T/C, shard results and packet paths. Confirmation-only local FF, each member/root integration note, closure read-back and actual Orca cleanup. Confirm target HEAD, absent worktree and **zero push**. Reviewer invalid/incomplete output blocks integration.

Missing credentials, disposable-project grant, Orca host, interactive terminal or macOS environment is a recorded blocker. Mock cases, RPC registration and help discovery remain separate evidence classes.

Real product repo/GitLab preflight is read-only. Creating Issues/worktrees, terminal prompts or cleanup there requires a separate explicit operation authorization. CI success cannot substitute for either platform's interactive evidence. Store unverified platform/capability gaps as blockers and report them, rather than calling this in-progress experiment production-ready.
