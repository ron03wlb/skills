# Issue 76: workflow instruction evidence

This audit implements [Issue 76](https://github.com/ron03wlb/skills/issues/76) under [Spec 72](https://github.com/ron03wlb/skills/issues/72), against execution baseline `49951f9b63434a1712f937c984785ac8cb966098`. It changes instructions, their contract checks and the package's exact shared-reference list; runtime workflow ownership stays unchanged. The executable workflow governing this delivery remains pinned to `db130a91219ef4df4a7339b0a6c3b9149b6fc66692768ce32be656f0529bda37`.

## Official guidance and project decisions

The [GPT-6 Astra guidance](https://developers.openai.com/api/docs/guides/latest-model), fetched 2026-09-08, recommends auditing conflicting instructions, making user intent and Skill precedence explicit, explaining Skill-caused pauses, fitting delegation to the harness and keeping verification proportional. [Build skills](https://learn.chatgpt.com/docs/build-skills), fetched the same day, recommends focused descriptions, progressive disclosure, explicit inputs/outputs and prompt-based trigger evaluation, with scripts for deterministic work or external tooling.

The project's Grants, operation identities, ten-wave repair budget, owner handoffs, physical-absence closure rule and candidate-bound verification cache are project decisions. Those official pages do not prescribe these schemas or budgets. This change retains independent review and required candidate/combination checks; it adds no generic permission system or delegation default.

## Owner and handoff audit

| Rule | Evidence and owning source | Bounded result |
| --- | --- | --- |
| Approved bootstrap | `docs/agents/references/approved-pre-run-workflow-maintenance.md`; `readBootstrapHandoff`/`run-preparation.mjs`; Issue 73–75 completion records | The existing owner already carries original Start through EXECUTE, CLOSE and CONTINUE. Keep it unchanged. Move its explanation into execution/close docs' invocation choices so those choices no longer appear to exclude it. |
| Completed explicit selection | `installed-entry.mjs` → `selectInstalledLane`, `codex-workflow.mjs` completed-re-entry capability; Issue 74 candidate `c9320b81e2981584486a3b1ed5ca13a32f194fd6` | Run entry now distinguishes explicit completed reconciliation from unique non-terminal no-argument selection. Original Grant/package, STOPPED and changed-scope gates remain. OPERATOR already described these runtime semantics. |
| Pending native calls | `references/codex-host-driver.md`, `scripts/codex-host-driver.js`; Issue 75 candidate `cf45c0de017f0ee2e148ace9b92cd8d91688ef3e` | Retain the tested driver owner. Replace OPERATOR's premature entry-resume suggestion with the existing live-cell versus confirmed-stopped-cell branches. Run/recovery stops exclude pending owning results and healthy waits. |
| Native lane creation | `codex-workflow-tasks.mjs` → `create`, existing creation-intent recovery and execute adoption | Replace lifecycle's stale `local` environment with the implemented `worktree` environment starting at the recorded target. Keep exact prepared-lane adoption. |
| Panel failure | `run-workflow.mjs` panel catch and `run-coordinator.mjs` → `panelUnavailable` | Replace unconditional lifecycle stop with available text-control continuation; missing control capability still returns `panel_unavailable`. |
| Real pause attribution | `docs/agents/references/workflow-stop-diagnosis.md`; Run's `references/recovery.md#stop-with-a-diagnosis` | One plain external reference owns the shared Skill attribution rule: exact entry, applicable quote, referenced rule and observed condition. The Run reference retains Run-specific fields and recovery actions. Each leaf conditionally reads the external rule, without invoking or linking into another user-invoked Skill. Existing approval and rule preconditions are checked before asking again. |
| Installed reference reachability | `workflow-installation.mjs` → `sharedReferences`; `workflow-installation.test.mjs` | Include the exact external diagnosis path in the package's existing allowlist. The real fixture install first failed with ENOENT before this addition and then passed, including unchanged retained-version recovery. No installation was performed against the user's installed package. |
| Partial close and target dirt | `execute-issue/SKILL.md`, `close-issue/references/executable-closeout.md`, `close-continuation.mjs` | Separate direct human retry from an unchanged authorized coordinator's same-owner continuation. Human-owned dirt still needs resolution; neither route repeats execution for valid completion. |
| Host release | `close-issue/references/host-cleanup.md`, `pending-host-cleanup.mjs`, `CODEX_HOST_RELEASE_CAPABILITY`; Issue 73 candidate `c61a3475b4e93d680af880d169b76a8d327cc1a7` | Preserve `UNAVAILABLE`, exact ownership, failed observations and lease release. State physical directory absence explicitly at executable-close preflight. No automatic archive, process stop or invented cleanup capability. |
| Verification | `execute-issue/SKILL.md` and `scripts/verification-cache.mjs` | Co-locate the required checks and exact reuse conditions before review. Repeat/broaden only for changed inputs, failure, unresolved concern or explicit repository requirement. Completion still freshly validates cache inputs. |
| Planning and routing | `to-spec/SKILL.md`, `to-tickets/SKILL.md`, `.agents/invocation.md`, preparation/operation/completion references, `ask-matt` and affected metadata | Planning/publication and human invocation rules already agree; no producer, invocation or metadata change is needed. Update only ask-matt's affected route description and promoted execute/close/ask-matt docs. |

Expected paths were discovery hints. Updating the stale lifecycle environment/panel descriptions and obsolete contract assertions follows Step 1's reachable-owner audit (AC-1/AC-3). The packaging addition is necessary to keep the shared instruction reachable after installation; no workflow transition changes. Independent review of `a54b7f6c2ec53a8494a1e5707df9e1501e436798` confirmed the cross-Skill reference boundary and prose-branch formatting findings. [Repair wave 1](https://github.com/ron03wlb/skills/issues/76#issuecomment-5581454917) was recorded and read back before moving that rule and formatting direct/coordinator choices as lists. The required execution plan is the only declared workflow artifact. This report and the evaluation data below are ordinary Issue scope.

## Live model scenarios

[Exact evaluation data](evidence/issue-76-model-scenarios.json) contains each full submitted prompt, model and command arguments, source-file SHA-256 values, timestamps, actual read commands/results, unedited model answer, expected outcome and assessment. The expected outcomes were not included in submitted prompts. The original six cases below are historical observations bound to `a54b7f6c2ec53a8494a1e5707df9e1501e436798`; their raw CLI event streams remain at `C:/Workspace/open_source/skills/.git/workflow-evidence/issue-76/scenarios-gpt-5.5/` and their digests are retained. Repair observations are recorded separately below.

Six independent ephemeral Codex CLI 0.147.0 evaluations ran with `gpt-5.5`, `xhigh`, `--ignore-user-config` and a read-only sandbox on 2026-09-08. Repository instructions remained in effect. The model actually used local file tools, then selected proposed next actions from synthetic workflow snapshots. It performed no tracker, native task, Run, Git mutation or test action. Answers are preserved in their original mixed Chinese/English language as source evidence; this report's assessments are in English.

| Scenario | Observed model decision | Assessment and limits |
| --- | --- | --- |
| Approved bootstrap | Continue `execute-issue` under the exact maintenance handoff; no second human command or invented Grant | Main decision matched. The answer's handoff facts came from the synthetic prompt, not a live tracker read. |
| Completed re-entry | Reconcile S under its original Run/Grant without execution, verification or close replay; T retains its legal ready action | Main decision matched. No completed live Run was replayed to test this answer. |
| Pending native result | Continue `functions.wait` on the original live cell; require stopped-cell and original-outcome evidence before recovery | Main decision matched. Actual slow native Promise survival was not exercised here. |
| Real scope change | Keep revised behavior outside the old Grant; proceed to requested Spec revision/publication without executing or deploying it | Main decision matched and the answer quoted execute/to-spec boundaries. No new live publication was made. |
| Unavailable host release | Preserve OPEN, integrated C, valid completion and exact pending directory; report `HOST_CLEANUP_BLOCKED`; prior archive incident is insufficient | Main decision matched. The answer cited the referenced host rule but omitted the originating `SKILL.md` entry link and lease disposition. Full diagnostic formatting and actual release behavior are not demonstrated by this answer. |
| Unchanged passing verification | Reuse exact fresh cache hits; write/read back one completion note and stop, without more tests | Main decision matched. The cache hit was a synthetic premise; the model performed no completion write. Actual candidate-cache verification is separately recorded by this execution. |

These are live model observations, not text-matching or mocked model outputs. Their narrow result is next-action selection under supplied facts. They do not prove autonomous end-to-end delivery, complete diagnostic formatting in every response, behavior under interrupted real mutations or universal model reliability. The host-release omission remains visible rather than being converted into a passing assertion.

### Repair-source observations

Repair wave 1 moved the shared rule to an external reference, changing direct inputs for five scenarios. Those five ran once more with the exact original prompts, model, reasoning and read-only harness, without expected answers or corrective coaching. Their current source hashes and raw responses are in `repairEvaluations` in the same data file, with event streams under `scenarios-gpt-5.5-repair-1/`. The completed-re-entry source files remained byte-identical, so its original observation was reused. No failed Astra request was repeated against the unchanged incompatible CLI.

All five follow-ups chose the expected main action. The scope-change answer permits the requested Spec revision/publication and requires matching authority for later revised execution. The host answer names the originating Skill path but still omits a clickable entry link and reverse-order lease disposition; those behaviors remain unproved. The pending-result run retained four failed read attempts before successfully reading the correct files. Actual command results remain in the data, and additional reachable-source hashes do not imply that the model followed every reference. No actual workflow action or complete diagnostic-format guarantee is claimed.

### Unavailable Astra evaluation

The same six prompts were first submitted to `gpt-6-astra` using CLI 0.147.0. All six failed before a model answer: the service returned HTTP 400 stating that the model requires a newer Codex version. The old CLI also reported missing model metadata. Direct launch of the already-installed desktop's bundled `codex.exe` failed with Windows access denied. No upgrade, host patch, access-control workaround or global model-setting change was attempted.

Astra next-action behavior for these six cases remains **unproved**. The available GPT-5.5 evaluation is not an Astra result. Failed attempts, exact prompts and event digests are retained in the committed data, with raw failures under the sibling `scenarios/` directory.

## Prerequisite host evidence

Live tracker and Git read-back at entry showed Issues 73–75 closed and their latest reviewed candidates reachable from the baseline. Later coordinator-provided outcome files were read at `issue-73/host-release-close/outcome.json`, `issue-75/host-release-close/outcome.json` and `issue-74/host-recovery-outcome.json` under the same Git-common-directory `workflow-evidence` root. They record exact idle-task archive/restore recovery, physical removal, tracker closure and released leases; Issue 74 also records zero directory holders after archive and restoration of the original archive states.

These are bounded observed incidents, separate from the delivered bridge capability. They do not establish reusable helper ownership or respawn guarantees. The earlier Windows EBUSY/respawn failures and unavailable-capability report in [Windows evidence](workflow-windows-evidence.md) remain historical records, and the current generic host-release boundary remains `UNAVAILABLE`.

## Reading load and verification

`node scripts/measure-operational-reading-load.mjs` retains the exact Issue 67 baseline `9714cce428597f9ec5edc4b3665d2c0d1f9d7697`. Its convention counts whitespace-delimited words in full UTF-8 files, once per selected path. Entry counts are `to-spec: 987`, `close-issue: 565`.

| Entry plus required reference path | Fixed baseline | Issue 76 candidate |
| --- | ---: | ---: |
| Fresh Single publication | 3,867 | 3,472 |
| Fresh Multi publication | 3,851 | 3,456 |
| Executable close | 2,345 | 2,244 |
| Parent-only close | 1,839 | 1,208 |

The unchanged measurement script lists each counted path; all four strict reductions and existing entry budgets remain enforced by `operational-reading-load.test.mjs` and `skill-contracts.test.mjs`. A failure branch additionally reads the diagnosis/host references and is not represented as an ordinary-path reduction. Neither word counts nor the evaluation's reported usage establish token, cost, latency or intervention savings; no comparative experiment measured those outcomes.

Structural tests remain separate from model behavior evidence. Two initial focused failures were an ask-matt 701/700 word count and a stale docs authority wording assertion; both were corrected and the exact two affected tests then passed. Candidate-bound focused/full-suite results and independent Standards/Spec reviews belong to the implementation completion record, avoiding a self-referential candidate in this report. No typecheck script or TypeScript configuration is present. Existing exact-candidate cache results are reused only after fresh configuration, runtime, permission-profile and required external-input read-back.
