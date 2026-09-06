# Installed workflow delivery evidence

These are the actual #56 validation observations through 2026-09-07 (Asia/Taipei). The isolated validation target is `codex/issue-56-validation`; its marker files are not delivered to `features/ron`. The final #56 implementation receipt owns the reviewed candidate and final verification, and closeout separately owns its integration and tracker closure.

## Delivery and recovery

| Boundary | Observed result |
| --- | --- |
| Multi-Spec / HEAD | Original parent [#59](https://github.com/ron03wlb/skills/issues/59), leaves [#60](https://github.com/ron03wlb/skills/issues/60) and [#61](https://github.com/ron03wlb/skills/issues/61), and Single [#62](https://github.com/ron03wlb/skills/issues/62) are closed. One original native task was retained per executable Issue. #61 started only after #60 closed. Final installed entry returned both positive Runs `SUCCEEDED`, with every candidate reachable and exact Issue worktree absent. |
| Healthy wait | The coordinator recorded `target-writer-wait.started` at 14:25:58.153Z and `settled` at 14:31:47.550Z on September 6: 349.397 seconds, outcome `RELEASED`. While waiting, the independent beta task committed `fcc6270` against the original seed. The coordinator then re-read current readiness; no lock was stolen and no execution retry was spent on the wait. |
| Same-scope conflict | Alpha `f2fb6a1` advanced the target and conflicted with beta's original same-line edit. The close owner aborted, verified target restoration and released both leases. The coordinator sent repair to the original beta task. Repaired candidate `74cb12a` preserves alpha and beta as ready, with renewed 234-test verification and clean independent review. The final ordinary integration `9b2a322` also preserves the dependent marker; its 234-test integration check passed before exact cleanup and closure. |
| Accepted response loss | One actual #60 close request was accepted and its response deliberately lost. After an intentional heartbeat interruption, entry adopted the same task and observed the completed merge, absent worktree and closed tracker instead of replaying close or creating a replacement. |
| Version / legacy | Live runtime source `5940fcb` used installed version `69e3e0e881f7e17f9603a6d95bf185ee29b56360e5af1c46fada4ebdba200a20`. All eight then-retained packages passed content validation. Original Grants retained their recorded versions. The current public entry also read original completed [#57](https://github.com/ron03wlb/skills/issues/57) as `SUCCEEDED` on its original Run, candidate `faca433` and target, with its old worktree absent. Neither read-back dispatched new product work or repeated valid execution checks. |
| Scope isolation | [#63](https://github.com/ron03wlb/skills/issues/63) deliberately changed after its approved publication. Entry returned `tracker_authority_conflict`, zero retries, no Run Grant and no task while independent positive lanes progressed. It was closed administratively as `not planned` after the expected negative result; the changed scope was never implemented. The earlier three-Spec batch correctly remained `PRESERVED`, not wholly successful. |

The live validation has interventions, not an unattended-success claim. Before the fixes, native reads could hang, an unsent #60 creation was forwarded once with agent assistance, and read-only follow-ups hydrated existing #60/#57 native histories. Temporary directories disappeared across interruption; exact registered worktrees were restored from their committed trees without inventing historical logs. Later model-mediated tick gaps and a slow native read caused additional heartbeat lapses. The driver now continues in one active cell and sends heartbeats during pending native calls; focused executable-guide checks cover control forwarding, one response per request and process-exit draining.

The host's automatic approval review rejected two #62 close-message attempts because the candidate was not yet reachable and the worktree still existed. The independent parent close continued. After the user's explicit continuation, direct closeout performed the ordered merge, integration verification, cleanup and tracker close, each from fresh evidence. Final entry then adopted those completed facts. This external review boundary and the direct recovery are included as interventions; no approval rejection is treated as successful native delivery.

App/coordinator interruption stops further dispatch after heartbeat loss. Already accepted workers may finish. This workflow provides no daemon or app-closed scheduling, and a preserved Run is not delivery. #49/#51 being superseded is not implementation evidence.

## Measured cost and limits

The #54 baseline was one documentation leaf. #56 used three executable leaves, a parent and an intentionally blocked scope case, plus fault injection, pauses and compatibility probes. All four observed worker tasks used `gpt-6-astra` / `xhigh`, but matching models do not make these workloads comparable. No savings percentage is justified.

| Entry phase | Native requests emitted | Observed CLI calls | Elapsed ms | Result |
| --- | ---: | ---: | ---: | --- |
| Restored live batch | 43 | 694 | 651,294 | PRESERVED |
| Resumed live batch | 48 | 557 | 570,944 | PRESERVED |
| Continuous driver, before pending-call heartbeat | 84 | 1,045 | 556,603 | PRESERVED |
| Pending-call heartbeat, approval rejection and interruption | 33 | 285 | 251,706 | PRESERVED |
| Final positive-Run read-back | 16 | 160 | 72,664 | SUCCEEDED |
| Legacy #57 read-back | 12 | 92 | 51,715 | SUCCEEDED |

These process measurements include failed attempts, deliberate waits, polling and driver delays. Native counts are emitted requests, not guaranteed accepted mutations. CLI counts come from the outer passive process trace; the legacy composition's narrower internal counter is 81 rather than the outer 92. Worker shell actions and direct closeout are outside those entry CLI counts. Direct #62 integration separately took 25,233 ms for 234 passing tests.

Earlier observations remain part of the failure history: #54 had 14 forwarded native calls across four entry invocations; the original #56 entry emitted eight requests, forwarded seven and recorded 210 CLI calls (109 Git, 100 GitHub, one terminal setup) over 254,815 ms. Another interrupted entry incorrectly returned empty `SUCCEEDED` after one request and 96,200 ms; the batch regression now preserves all unobserved selected Specs as unavailable. Other early probes and re-entries lack complete raw coverage after temporary-directory loss. These historical summaries are not recreated raw traces or a complete total.

| Worker-only observed counter segments | Total tokens | Cached input tokens |
| --- | ---: | ---: |
| #57 baseline implementation | 2,819,057 | 2,696,704 |
| #57 later read-only recovery | 249,967 | 142,336 |
| #60 implementation, recovery and close | 4,326,836 | 4,101,376 |
| #61 implementation, close and parent close | 3,374,370 | 3,248,640 |
| #62 implementation, conflict close and repair | 7,385,066 | 7,225,856 |

Worker totals sum the last cumulative counter in each observed segment, splitting when counters reset. They include repeated cached input and are neither unique context size nor billed cost. Root/control, independent-reviewer, product-plus-review and full-system token totals are unavailable; #62's later root-owned close is outside its worker counter. Complete human-intervention counts and comparable wall-clock totals are also unavailable. Failed runs are retained rather than filtered from the denominator.

## Evidence-driven changes

- Successful tracker reads with deterministic record, publication or scope conflicts now stop immediately, removing the observed 5/15/30-second network probes. Real transport failures retain bounded recovery.
- Disconnect is checked before new task-intent reservation. Existing uncertain intents still require exact native outcome evidence.
- Exact local delegation-input hints are checked before broad task-history discovery, followed by native identity and Git ownership proof. Multiple matches remain ambiguous; unrelated saved-checkout coordinator histories are skipped.
- Completed native `notLoaded` turns can settle; active or unreadable unfinished work cannot. This avoids replaying still-valid implementation and review.
- An active driver yields between ticks, heartbeats pending calls and drains terminal output. It neither retries a pending native request nor starts another coordinator. Local guide tests are component evidence; the final real entry read-backs separately prove installation-to-host wiring.

These changes reuse the existing boundaries. Required candidate verification, independent Standards/Spec review, integration verification and close-owner leases remain in place; no generic repair skill or new receipt framework is added.

Local current evidence is in the canonical Git common directory under `workflow-evidence/issue-56`: `*-live-host.jsonl`, `*-live-commands.jsonl`, `legacy-final-*`, `final-measured-costs.json`, `accepted-message-loss.json`, `healthy-wait-before-release.json`, `interruption-readback.json`, `directory-recovery.json`, and the candidate-bound verification/review files. Run journals independently preserve wait, dispatch, repair and terminal observations. Earlier `/private/tmp/skills-issue-56-evidence` raw files are unavailable. Tracker completion links and Git commits remain independently readable; local evidence is not a public or permanent audit archive.
