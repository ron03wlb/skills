# Installed workflow evidence checkpoint

This is an incomplete #56 checkpoint, not `implementation_complete`. The isolated validation target is `codex/issue-56-validation`; its marker files are not delivered to `features/ron`.

## Observed boundaries

| Boundary | Evidence and current result |
| --- | --- |
| Repository | Candidate `c3f665960acc9de0426b02161a0eccb7ee4f0d5a`: 236 tests pass. Separate Standards and Spec installation-risk reviews have zero confirmed findings; final delivery review remains pending. |
| Installation | The public entry resolves to retained package `07c35f726d2cc748611ab21b3f145fe3fd4f6d4169b29e19316cd1e133790a3d`, sourced from that candidate. Five earlier versions remain retained. This proves installation, not successful Run recovery. |
| Native delivery | [#60 completion](https://github.com/ron03wlb/skills/issues/60#issuecomment-5558393940) records candidate `f2fb6a1e5b1859f0c7cf94715b9791f7e4f74101`, exact alpha bytes, 234 tests and clean review in the original task/worktree. Target integration and close remain pending. |
| Multi-Spec / HEAD | Real parent [#59](https://github.com/ron03wlb/skills/issues/59), children [#60](https://github.com/ron03wlb/skills/issues/60) and [#61](https://github.com/ron03wlb/skills/issues/61), and Single [#62](https://github.com/ron03wlb/skills/issues/62) have fixed publications and native edges. Only #60 has a task; concurrent delivery, HEAD advancement and parent DoD are pending. |
| Healthy wait / conflict | A real validation-target writer was acquired, maintained for 626,926 ms and normally released by the authorized observation owner. Coordinator observation/resumption and the same-line alpha/beta merge conflict are pending; holding a lock alone is not end-to-end proof. |
| Interruption / response loss | The original installed process lost its host heartbeat, preserved Runs and released its writer. It had reserved #60 intent before emitting a native create. The exact unsent request was later forwarded once with agent assistance; this is an intervention, not autonomous recovery. Accepted-message response-loss recovery remains pending. |
| Version / legacy | Trusted old packages remain readable; current-runtime continuation of the original validation Runs and the completed [#57](https://github.com/ron03wlb/skills/issues/57) Run remain pending. Component compatibility tests do not substitute for that entry read-back. |
| Scope / ownership | [#63](https://github.com/ron03wlb/skills/issues/63) was deliberately changed after publication. The original entry blocked it without a task, but incorrectly used network probes. Source regressions now distinguish deterministic record, identity and scope conflicts from transport failures. Formal re-entry proving immediate isolation while A/B progress is pending. |

The resumed installed entry could not pass the native `list_projects` request. Separate `wait_threads` and `read_thread` observations also did not return. After heartbeat loss, this entry incorrectly reported `SUCCEEDED` with no observed Runs (one tool request, 96,200 ms). That raw result is a confirmed failure, not delivery evidence. The batch result repair now retains every unobserved selected Spec as `UNAVAILABLE` and reports `PRESERVED`; the regression reproduces the old false success. Formal installed retesting remains pending. Git/tracker reads remain available. Preserve the original task and Run intents; no replacement task or successful delivery receipt is justified by this availability failure.

## Measured cost coverage

| Observation | #54 available baseline | #56 observed portion |
| --- | --- | --- |
| Workload | One documentation Issue through close | Three selected Specs with a negative scope case; interrupted before dispatch, then one assisted task creation and one completed implementation |
| Worker model / effort | `gpt-6-astra` / `xhigh` | `gpt-6-astra` / `xhigh` for #60; remaining tasks not created |
| Forwarded native calls | 14 across four entry invocations; includes failures | Seven in the original entry, eight emitted; one subsequent assisted create. Unreturned native probes and the resumed entry are additional unsuccessful attempts. |
| Original #56 entry CLI calls | Complete comparable total unavailable | 210: 109 Git, 100 GitHub CLI, one terminal setup; includes failed attempts |
| Original entry duration | Available individual process observations, incomplete total | 254,815 ms; includes deliberate heartbeat loss and driver delay |
| Worker-only cumulative tokens | 2,819,057, including 2,696,704 cached input tokens | 2,870,415 through #60 implementation, including 2,772,224 cached input tokens |
| Control / product-plus-review / full total tokens | Unavailable | Unavailable; worker-only counters exclude root coordination and independent reviewers |
| Complete human-intervention total | Unavailable | Unavailable; one agent-assisted unsent-create recovery is explicitly observed |

These workload and coverage differences prevent a savings percentage. Repeated cached input is included in the reported provider counters; it is not unique context size or a billed-cost estimate. The two unchanged worker model settings alone do not make the total workloads comparable.

The measured scope conflict received 5/15/30-second probes despite successful GitHub reads. The repair removes those deterministic retries at the existing tracker/coordinator boundary, while keeping actual outage probes. A second observed repair checks host disconnect before durable intent reservation. Both retain required verification and close-owner authority; neither introduces a recovery Skill or receipt framework. Local regressions pass, but the repaired live paths still need the native host.

Local raw evidence is preserved under `/private/tmp/skills-issue-56-evidence`: `baseline-host-trace.json`, `baseline-commands.jsonl`, `baseline-inventory.json`, `unsent-creation-recovery.json`, `unsent-creation-native-response.json`, `worker-60-usage.json`, `healthy-writer.jsonl`, `wave-3-full.log`, `wave-3-standards.md`, `wave-3-spec.md`, `wave-3-install.json` and `wave-3-host-trace.json`. These observations are separate from completion authority and should be updated with actual final DoD evidence when the host becomes available.
