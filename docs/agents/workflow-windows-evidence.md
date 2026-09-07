# Windows workflow maintenance and installed delivery evidence

This is an observation log, not a workflow contract. The historical maintenance section follows Issue 65 and ADR-0066; the Issue 66 section follows its approved Spec 64 revision. docs/agents/run-preparation.md owns the continuation instructions.

## Scope and entry

- Date: 2026-09-07; repository: ron03wlb/skills; target: features/ron.
- Execution baseline / successor Planning Seal: caa023bd7ad52827c5103fdc7467986994b5dab0.
- Lane: codex/issue-65-windows-bootstrap in C:/Workspace/open_source/skills/.claude/worktrees/issue-65-windows-bootstrap.
- The original /run-issue-workflow 64 attempt reported spawnSync stty ENOENT and an unavailable source-linked installation before any Run Grant. The user then approved the bounded Spec revision and explicitly invoked /execute-issue 65. This repair therefore does not claim that the historical failed Start automatically executed the new maintenance path.
- The formal GitHub reader now returned EXECUTE / execute-issue for the original approved Spec revision, exact maintenance Issue and current human approval. Its operation key matched the existing execution identity. This read created no task or Grant.

## Observations before installation

Both approved public entries were Junctions to C:/Workspace/open_source/skills/skills/personal/run-issue-workflow:

- C:/Users/ron.chang/.codex/skills/run-issue-workflow
- C:/Users/ron.chang/.agents/skills/run-issue-workflow

A real Windows source-entry TTY probe completed with exit 0 and a structured UNAVAILABLE response for an intentionally nonexistent Run: Selected Run has no recorded grant; preserve its files. It made zero native tool calls. This proves native TTY initialization and restoration, not package availability or product delivery.

The Windows filesystem tests observed directory-symlink EPERM, so directory links use junctions on Windows. The earlier Planning Seal lease-retirement EPERM was not reproducible in 100 real acquisition/release cycles; bounded same-generation retry covers that observed error without claiming its cause. Repeated real target/repository lease release and injected transient/persistent EPERM tests pass while preserving unresolved ownership.

## Reviewed installation and read-back

- Reviewed runtime source: 91ff565cd89cbdee6aa17af663f7b45e8ac47cec. Standards and Spec runtime reviews were clean after one recorded repair wave.
- Source repository: C:/Workspace/open_source/skills; cache: C:/Users/ron.chang/.codex/workflow-packages.
- Actual retained version: 80a8d83f421b92e25a7ff8666be1dc8e05e9f147352f2fb5e548075b858d8451; protocol 1; 243 manifest files verified. Both links resolve to C:/Users/ron.chang/.codex/workflow-packages/versions/80a8d83f421b92e25a7ff8666be1dc8e05e9f147352f2fb5e548075b858d8451/skills/personal/run-issue-workflow.
- The reviewed installWorkflow operation used these exact source/commit/cache/entry paths and the freshly verified previous source target. Both exact retries returned reused: true and backup: null; the backup inventory stayed unchanged. Package selection through the retained implementation returned AVAILABLE; pending intent and installer lock were absent.

| Public entry | Retained original-link backup |
| --- | --- |
| C:/Users/ron.chang/.codex/skills/run-issue-workflow | C:/Users/ron.chang/.codex/skills/run-issue-workflow.before-8513e6ee-9af3-4a7d-8d48-0fb4214bc711 |
| C:/Users/ron.chang/.agents/skills/run-issue-workflow | C:/Users/ron.chang/.agents/skills/run-issue-workflow.before-e437bd8a-0354-4516-b091-138a0b1dd19d |

Each backup still resolves to the original source target stated above. No older package was removed.

For each installed public entry, the real host ran node <public-entry>/scripts/installed-entry.mjs C:/Workspace/open_source/skills 64 issue65-installed-startup-probe with tty: true. Both probes exited 0, returned structured UNAVAILABLE (Selected Run has no recorded grant; preserve its files), and made zero native tool calls. The intentionally nonexistent Run checks native TTY startup/restore without dispatch; the independent package/content check above proves installation availability.

The retained GitHub reader independently returned EXECUTE for the exact approved #65 handoff with the same deterministic operation key. Existing Run/Grant inventory was identical before and after installation/probes, with no #64 Grant. Target and repository close leases remained ABSENT. This execution preserves its worktree and does not perform closeout. After the completion note is published, the existing owner must read it before choosing the close stage; actual subsequent product delivery belongs to #66.

## Verification and limits

- Exact committed runtime 91ff565cd89cbdee6aa17af663f7b45e8ac47cec: node --test tests/ron-workflow/*.test.mjs passed 253/253 (exit 0), recorded by execute-issue/scripts/verification-cache.mjs with fresh configuration/toolchain inputs. Node v24.14.0, Git 2.45.1.windows.1, bsdtar 3.8.4; no configured typecheck command.
- Focused package/driver/bootstrap checks passed; after the single Standards repair, the affected authority/contract checks passed 3/3. Independent Standards and Spec runtime reviews then reported zero confirmed findings and zero advisories.
- Fixtures cover both LF and CRLF forwarding/heartbeat/control/drain, valid and escaped/tampered packages, interrupted installation and exact retry, stale/foreign/missing authority, Pause/Stop/disconnection, same-operation completion stages, accepted-task response loss, partial close and ordinary Grant reconciliation. The GitHub fixture exercises actual Git worktrees and Windows path aliases with a substituted tracker; it does not claim live tracker delivery.
- Necessary Windows discovery: preserve archive content regardless of core.autocrlf, invoke the test tracker CLI through Node, and canonicalize native Git worktree paths. These repair the observed Windows verification/ownership seams within AC-1/2/6/7; no scope change was made.
- The final candidate may advance only for this evidence log; its exact SHA, fresh final verification, two-axis review and completion are bound by the owner-produced Issue 65 completion note. The installed runtime remains the reviewed commit above. Neither fixture success nor these startup probes claims two-Spec product delivery.

## Issue 66: post-repair continuation and validation population

This section records the 2026-09-07 local Windows observations for [Issue 66](https://github.com/ron03wlb/skills/issues/66). It is non-contract evidence. The approved Issue and its parent Spec remain acceptance authority. All timestamps below are UTC.

### Parent lineage after repair

- Execution task: `01a07b2c-fde8-7683-a303-6e8e061c518d`; original coordinator/human task: `01a07a6b-fee2-7832-b7ac-720ab9263a04`.
- Issue lane: `codex/issue-66-windows-validation`, `C:/Users/ron.chang/.codex/worktrees/e9ba/skills`; common directory: `C:/Workspace/open_source/skills/.git`. The native `codex-thread.json` owner matched this task. Initial detached HEAD and the clean target both matched baseline/Planning Seal `486b85149c7b1507908c051453b565ace8302dcd`; execution adopted this worktree and created no second Issue 66 lane.
- T0: `2026-09-07T09:17:37.388Z`. Exact supplemental source: `.git/spec64-revision-continuation/t0.json`. Preserve the original failed Start and the pre-T0 explicit `execute-issue 65`, `close-issue 65`, repeated `execute-issue 66`, and attempted `close-issue 66` commands as manual recovery history.
- Revised Spec 64 publication: `IC_kwDOTh5gv88AAAABS-XseA`; decomposition: `IC_kwDOTh5gv88AAAABS-YDWg`; composite handoff: `IC_kwDOTh5gv88AAAABS-YOwQ`. Scope: `sha256:0e7fc4590992f86c72378c0e853e800a2127418ec968646b1eecdc79c468f16a`. Issue 66 body read-back matched its decomposition digest `sha256:d03ece1ca5c5d958933deafc00113b62b28fa958307c6e1eddabc3434f8623fb`.
- The adopted Issue 65 remains closed with original completion `IC_kwDOTh5gv88AAAABS9dEdw` and candidate `a0bd7b8ade159c74c1cd5287c601e8be6ae82e9e`. Its completion body digest remains `sha256:fb491f074e2567caaa1ef67374a1ecdcbfbb09ca80469f80d0758a4b3eec17c3`; the new decomposition explicitly adopts it rather than rewriting its original publication or replaying maintenance.
- Actual Spec 64 Run: `workflow-op-v1-9817c40b6e8d9a39a16001674e57ca7e7c9a9481e7ec17b03d715cea29f9ce8e`. Its Git-common-directory journal records `grant.recorded` at `09:19:53.923Z`, then this exact task's `dispatch.recorded` at `09:22:30.925Z`. Its accepted native task input binds the same Grant, target, Issue and pinned package. The real Grant precedes dispatch after T0; a validation-batch Grant is not used as substitute lineage.
- A native read-back of the continuing parent turn (`01a07b1e-bf0a-78f2-b7a2-308f2f09aa4b`, started before T0) returned only its original pre-T0 human `execute-issue 66` input; subsequent coordination stayed in that turn. `.git/issue66-validation/parent-human-lineage-readback.json` preserves that bounded observation, complementing T0, the ordinary Grant/accepted dispatch and `.git/spec64-revision-continuation/host-observations.json`; it does not reconstruct unavailable older raw traces.

### Installed baseline and exact publication

Both public entries resolved to retained package `c7a2ba4729eb64c4ff1604b2fa8ad503991988b9ff7da58688ae6294041757b5`. The installed `selectWorkflowVersion` returned `AVAILABLE` after verifying the complete manifest. Runtime source is `f79bdd643c474c112219a3ae9ba1129fdeab5b68`; its tree matches reviewed integration/baseline `486b85149c7b1507908c051453b565ace8302dcd`. No validation Run installs or edits this package.

The saved local Git project read back as `8227b10c-2e66-4381-8fbd-9529632eb60d`, `C:/Workspace/open_source/skills`. The isolated validation target is `codex/windows-workflow-validation` in `C:/tmp/skills-windows-workflow-validation`, created at that reviewed baseline. Its marker files are not part of the Issue 66 contribution to `features/ron`.

The pinned `to-spec` and `to-tickets` owners used fresh primary reservations, `readPlanningBaseline`, owner-derived operation identities, operation-scoped v2 checkpoints, GitHub pre-read/write/read-back and native parent/blocker relations. All four tracker Issues were read back before installed dispatch. No Grant or tracker receipt identity was fabricated. The accepted scopes come from the existing Spec 64 handoff, and no SQL prerequisite was declared.

| Role | Tracker identity | Publication / final producer handoff |
| --- | --- | --- |
| Single [#68](https://github.com/ron03wlb/skills/issues/68) | `I_kwDOTh5gv88AAAABQD4elg` | `IC_kwDOTh5gv88AAAABS-mWrA` / `IC_kwDOTh5gv88AAAABS-mZbQ` |
| Multi parent [#69](https://github.com/ron03wlb/skills/issues/69) | `I_kwDOTh5gv88AAAABQD4sQw` | `IC_kwDOTh5gv88AAAABS-mm7Q` / `IC_kwDOTh5gv88AAAABS-nFMw` |
| First child [#70](https://github.com/ron03wlb/skills/issues/70) | `I_kwDOTh5gv88AAAABQD47Tw` | Decomposition `IC_kwDOTh5gv88AAAABS-m-lA`, key `69/01` |
| Second child [#71](https://github.com/ron03wlb/skills/issues/71) | `I_kwDOTh5gv88AAAABQD5C0g` | Same decomposition, key `69/02`; blocked by #70 |

Single scope is `sha256:8a4e8c857177d2f60d71a753bd63e29de6712811e3609ea007bf06a682e6fb8c`; Multi scope is `sha256:74d5ddb70c6b8e4d7bf5aa1ef14cc54a5526ab70dab4a5b7cb243c52884a1ac5`. Supplemental publisher inputs, actual immutable receipt IDs and completed-stage read-backs are retained under `.git/issue66-validation/` in `publish.mjs`, `publication-progress.json`, and `publication-result.json`.

### Live execution observations

The actual public command selected `68,69` through `C:/Users/ron.chang/.codex/skills/run-issue-workflow/scripts/installed-entry.mjs` with consumer `C:/Workspace/open_source/skills` in TTY session `16357`. It created these distinct Grants under the same retained package:

| Spec | Run | Grant recorded | First dispatch recorded |
| --- | --- | --- | --- |
| #68 | `workflow-op-v1-ae72b01673c4ea33ca199859b96a96d8d7f4110bb69c8c00b425054faf5bce10` | `09:35:02.443Z` | `09:36:18.892Z` |
| #69 | `workflow-op-v1-04684befbd64f5eaa8fcaa47530c74daaea6e777b955252423bae4b57cf6f3be` | `09:35:20.566Z` | #70 at `09:37:30.828Z` |

Original #68 task `01a07b39-6f4e-72d1-a320-954cd7d96557` owns `C:/Users/ron.chang/.codex/worktrees/2f4f/skills`; original #70 task `01a07b3a-86a2-7fb0-b185-4fcc7d69c2ca` owns `C:/Users/ron.chang/.codex/worktrees/638d/skills`. A single native `wait_threads` read returned both as `active` with `inProgress` execution turns. This proves cross-Spec execution overlap; exact response and observation timestamp are retained in `.git/issue66-validation/native-overlap.json`. At that observation #71 was still pending behind #70.

#70 closed at `10:08:27Z`; the installed journal dispatched #71 only at `10:10:43.167Z`, to original task `01a07b59-0c96-7473-88d2-14bf3ecc0025`, owning `C:/Users/ron.chang/.codex/worktrees/a06f/skills`. `.git/issue66-validation/first-child-success-release.json` retains the first-child success projection. #71's execution baseline is the already merged validation target, so this release follows actual candidate reachability, cleanup and tracker closure.

The delivered validation target is `04c82f8d09eff9ca046e21a948e9328a9f28454f`. All three candidates are reachable from it; all three exact Issue directories and registrations are absent, and their topic branches remain. The target is clean. Its `single.txt`, `multi-first.txt` and `multi-second.txt` files under `validation/windows-workflow/` match the canonical committed LF bytes (33, 38 and 39 bytes respectively). `features/ron` contains no validation marker paths.

| Executable Issue | Reviewed candidate | Completion identity | Tracker CLOSED at |
| --- | --- | --- | --- |
| #68 | `ead265057c967d78bc8cbf1d6be50adfcf08f278` | `IC_kwDOTh5gv88AAAABS-voIQ` | `10:06:15Z` |
| #70 | `c8d0094b0370759c70c2fe6f77d5d44ac03a9a7b` | `IC_kwDOTh5gv88AAAABS-wOOw` | `10:08:27Z` |
| #71 | `04c82f8d09eff9ca046e21a948e9328a9f28454f` | `IC_kwDOTh5gv88AAAABS_LHUA` | `10:48:42Z` |

Each original execution recorded 269/269 repository tests, exact marker checks, clean independent Standards/Spec review and zero repair waves. #70's merged combination was separately verified 269/269 before its close completed. The parent-only #69 close reused the original #71 task at `10:52:06Z` and read #69 CLOSED at `10:54:14Z`, after both children; it created no fourth execution task and left target unchanged.

The read-only lease samples observed the successful close intervals below, with repository and validation-target leases released between owners. All earlier failed/retried intervals remain in `.git/issue66-validation/lease-observations.jsonl`; the table does not replace that history or claim resolution below the 250 ms sampling interval.

| Successful close owner | Observed lease present → absent |
| --- | --- |
| #68, operation `workflow-op-v1-2bf9ce8f9b9c6a0b2f82835937bd3fb1a55f2759d28e899d004c7d16f8221e36` | `10:05:54.942Z` → `10:06:18.946Z` |
| #70, operation `workflow-op-v1-963fe242a8c2fb7e6e104996b126bb3a4cc414abae033bd1d14f20226a73f85d` | `10:07:57.820Z` → `10:08:36.764Z` |
| #71, operation `workflow-op-v1-845846fc7d490500037e81b57e8d18a8492cd89677de4ef1cc41cdbe172ef660` | `10:48:23.927Z` → `10:48:44.933Z` |
| Parent #69, operation `workflow-op-v1-2c787010956001ed895bdea26437eedcaf95b153982e8b3934758b8910529f96` | `10:54:08.984Z` → `10:54:16.775Z` |

Physical delivery did not by itself prove final Run success. The `10:56:15Z` provisional read-back showed both status projections as `SUCCEEDED`, but session `81662` subsequently terminated with `PRESERVED`: Multi remained `SUCCEEDED`, while Single reported `workflow_version_unavailable`. The exact terminal is retained in `.git/issue66-validation/delivery-terminal-81662.json`, alongside `provisional-delivery-105615.json`; it is preserved as a failed batch-shorthand attempt.

Source tracing explains the discrepancy: `installed-entry.mjs` excludes persisted `SUCCEEDED` Runs from shorthand selection, so it may omit the original Grant needed for compatible-version reconciliation. `run-coordinator.mjs` then returns its version diagnosis as a blocked status clone after rebuilding the successful facts; that clone is not itself persisted. A later `status.json` read can therefore remain `SUCCEEDED` while the actual attempt returned `PRESERVED`. This is an unresolved batch-shorthand runtime defect; neither the snapshot nor an ordinary shorthand retry proves recovery. Exact original Spec-plus-Run-ID selection reads the existing Grant directly under the documented recovery contract, without editing authority or package state.

The same public installed entry was then invoked sequentially with Spec `68` plus its original Run ID (TTY `85919`), followed only after its actual exit by Spec `69` plus its original Run ID (TTY `58868`). Both returned actual terminal `SUCCEEDED`, without diagnoses or new actions, and both processes exited. `.git/issue66-validation/reentry-single-terminal.json` and `reentry-multi-terminal.json` retain those results. This proves recovery and re-entry of the same completed validation population through explicit original Run IDs; it does not claim the batch shorthand or seamless upgrade was repaired.

The `11:03:17.433Z` before and `11:13:31.303Z` after audits matched all four Issue identities/bodies/comments, original task intents, three candidates/topics, target SHA and clean state, owned worktree inventory and canonical marker blobs/files. Original journal history stayed an exact prefix; the only appended event was Single's first `runtime.observed` for the already verified compatible package `079e66f...`. Grants, dispatches, close/repair/retry actions and Multi's existing runtime history did not change. Three native snapshots matched the same idle tasks, latest turns, assistant messages and tool markers. The 22 native calls across these two explicit re-entries were project/task reads and panel opens; none created a task or sent an execution/close message, and no original task replayed a verification command. Sources: `.git/issue66-validation/{before-reentry,after-reentry,native-before-reentry,native-after-reentry,reentry-host-observations}.json`. Unrelated worktrees were inventoried but excluded from the owned-worktree equality assertion.

Issue 66 contributes this ordinary evidence document and its required non-contract plan only. Its final candidate, repository-suite result, fresh verification inputs and independent Standards/Spec reviews are bound by the execution owner's completion record; those local fixture checks are separate from the live delivery/re-entry evidence above.

### Interventions and measurement limits

- The Issue 66 entry initially interpreted the package pin as covering host safety skills. It published/read blocked note `IC_kwDOTh5gv88AAAABS-hF8g`; the coordinator clarified in the same task that generic `writing-plans` and `verification-before-completion` use installed host copies, while Matt/Ron owners/runtime stay pinned. Execution continued in the same operation/task/worktree without a new Grant, permission or package change. Preserve this note as resolved intervention.
- The parent host required observed Windows ANSI and column-80 redraw decoding; its first parser retained and resumed a pending panel request in the same process. The validation host uses the same transport decoding while preserving native request IDs, heartbeats and the installed runtime. Supplemental parent details remain in `.git/spec64-revision-continuation/host-observations.json`. No raw panel token is committed.
- During the validation period the parent coordinator reported `CODEX_HOST_DISCONNECTED` during context compaction and resumed its exact original Run after confirming process exit. This is agent/coordinator intervention, not an additional human leaf or Start command. It does not erase the earlier T0-to-dispatch evidence.
- The validation driver also lost its native-host connection across context compaction. Its original TTY session `16357` exited with `PRESERVED`; the Run read-back recorded `CODEX_HOST_DISCONNECTED` while #71's already dispatched execution remained active. After confirming that exit, the same installed `68,69` selection resumed in TTY session `87644`, preserving the two Grants and three original execution tasks. This interrupted continuation is separate from the later completed-selection re-entry check.
- During that continuation the agent unnecessarily interrupted its driver cell while diagnosing sparse output. The final drain showed a healthy Multi projection (#70 `SUCCEEDED`, #71 `IMPLEMENTATION_COMPLETE`, `close_issue` legal), so this is an agent error, not evidence of a runtime stall. The original #71 task remained idle and no duplicate close request was sent; the coordinator preserved the process for its normal disconnect before re-entry.
- An external installation changed the shared current package to `079e66f66a4139e2ae36170d6e1bdb9de767b7aa517c7f55f631b6b5e21905a9`, source `60643fb996ac154581ca6cd78757b641d9543d91`. This validation lane performed no installation. The public restart selected that compatible current package; the Multi journal appended `runtime.observed` at `10:24:00.481Z`. The terminal read-back for session `87644` was `PRESERVED`, with a Single `workflow_version_unavailable` diagnosis and Multi disconnect diagnoses, not delivery success. `.git/issue66-validation/package-change-observation.json` preserves the installation and exact statuses. The package-boundary question was returned to the original coordinator before further dispatch.
- The coordinator traced that installation to separately authorized task `01a07ad5-fab2-7301-9dbe-5b49fb8832f6` and verified both retained/current packages through the original verifier. Their protocol/source identities match; the nine changed files concern GitLab producer HTTP recovery and its docs/tests, with no core coordinator, GitHub, execute or close changes. The original `run-issue-workflow` contract permits this trusted compatible runtime with unchanged Grant and recorded package history. `.git/issue66-validation/runtime-transition-observation.json` retains the external owner and exact diff. The same `68,69` selection resumed in TTY session `81662` after session `87644` exited; no package rollback, Grant edit or new human approval was performed. The completed-Single selection failure remains evidence, not a claim of seamless upgrade.
- The supplementary lease observer's first attempt called an unexported read function and recorded `unavailable`. It was stopped, corrected to the exported read-only `observeRepositoryCloseLease`, and restarted at `09:36:35.295Z`, before observed validation closeout. Its 250 ms samples record observations, not unobserved sub-sample intervals; `.git/issue66-validation/lease-observations.jsonl` preserves the failure and subsequent samples.
- An initial optional baseline command named a nonexistent test file and failed before testing. The actual focused `node --test tests/ron-workflow/planning-entry.test.mjs` then passed 4/4. Final candidate verification remains separate.
- The newly created #71 checkout materialized the inherited first marker with CRLF (39 bytes), although both the reviewed Git blob and validation target file had LF (38 bytes). The coordinator sent this read-only finding to the original execution owner to handle its exact verification seam; no contract, global Git setting or package was changed by that observation.
- The first #68 close attempt integrated its candidate and removed the worktree registration/content but left the exact empty directory. Its original close owner exhausted 5/15/30 second retries with Windows `EBUSY`, retained the OPEN Issue and released both leases. A parent maintenance owner then took read-only host-lock diagnosis outside validation. #70 observed the target advance to the #68 candidate and selected ordinary merge plus verification for the new combination; this is retained closeout history, not a replay of either reviewed implementation.
- Host current-directory metadata initially identified four idle per-task CUA/template-picker/REPL helpers holding #68's empty, unregistered, non-link directory. The parent host owner stopped verified PIDs `36116`, `23104`, `39364`, and `3440`; its initially filtered metadata then returned no matches. The next bounded close continuation still failed with `EBUSY`: that filter had missed `codebase-memory-mcp.exe` PID `29284`. An all-process read identified that same-cwd helper, which the owner verified and stopped before continuing the exact close operation again. Preserve this diagnostic omission and failed continuation. Supplemental sources: `.git/issue66-validation/host-cleanup-plan.md`, `cwd-lock-before.json`, `host-helper-stop.json`, `inspect-all-cwd-lock.ps1`, and `host-codebase-helper-stop.json`. The Codex main process and other tasks/tests were preserved. This is explicit agent host/close intervention from a safe cwd, not a new human command, task, Grant, or runtime-package repair.
- Codex then respawned helpers while #68's task remained idle. Exact-directory handle enumeration confirmed these helper handles and no Codex-main-process handle. The existing close owner therefore released freshly verified idle helpers immediately before nonrecursive empty-directory removal, inside its own repository/target leases. The same identity/idle-state checks and bounded recovery later completed #70. Previous `EBUSY`, respawn and healthy-lock-race failures remain preserved; the healthy competing lease was never stolen. #68's retained scratch wrapper also corrected an invalid HEAD-equals-candidate check for `ALREADY_MERGED` to the owner's existing ancestry check. #70 reused its passing merged-combination verification. See `.git/issue66-validation/host-recovery-observations.json`, `inspect-directory-handles.ps1`, `host-release-68.jsonl`, `host-release-70.jsonl`, and `.git/workflow-evidence/issue-68/close-host-continuation.mjs`. This proves recovery with agent intervention, not autonomous cleanup or a permanent fix to the unchanged host lifecycle.
- #71's ordinary same-task close turn began at `10:38:27Z`. Its scratch helper first encountered API-name mismatches; the owner corrected the observed local calls and preserved failed attempts. It then fast-forwarded target to `04c82f8d09eff9ca046e21a948e9328a9f28454f`, confirmed clean target and canonical LF bytes, and removed registration/content. The remaining empty `a06f/skills` directory again returned `EBUSY`. At `10:47:10Z` the original task was idle after its bounded retries, with both leases released and #71 still OPEN. `.git/issue66-validation/native-close-failure-71.json` preserves that partial result. The coordinator handed only the exact idle-host cleanup recovery to the existing parent owner; no new candidate or unchanged verification replay was requested.
- The parent close owner subsequently released ten freshly verified idle #71 helper processes and removed only that exact empty directory under its own leases, then read #71 back CLOSED. Original marker blobs matched the target checkout, so this continuation needed no additional normalization. The topic/candidate were retained and no unchanged verification ran. Sources: `.git/issue66-validation/host-release-71.jsonl` and `.git/workflow-verification/workflow-op-v1-c4d6c274f852bd93a2d209e9137bd8c38693e4a990e100e0b2a33d94b342a01d/close-host-continuation.mjs`. This remains intervened recovery of the unchanged host condition.
- Unmeasured token cost, wall-time savings, host resource cost, and unavailable historical raw traces are unavailable. Fixture checks and prior-host history do not substitute for the live assertions above.
