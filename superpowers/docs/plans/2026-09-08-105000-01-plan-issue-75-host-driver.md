# Issue 75: resumable Codex host driver

**Goal:** Centralize transport parsing and request transitions in one tested implementation loadable by the current host isolate.
**Why planning is required:** Interrupted native mutations and uncertain forwarding cross the coordinator/host authority boundary.
**Acceptance:** Issue #75 AC-1 through AC-4 under Spec #72; preserve original identities, pending outcomes, controls, and failed observations. Unknown framing and uncertain delivery remain observable. Retry requires original-owner evidence. Completion requires focused/full verification, independent Standards and Spec review, a clean committed candidate and one read-back implementation receipt. Integration and closure belong to a later close request.

### Outcome 1: deterministic transport with preserved evidence
- Work: Extract the executable Markdown driver into a dependency-free script under `skills/personal/run-issue-workflow/scripts/`; decode observed Windows terminal framing, fragmentation and LF/CRLF while retaining malformed and partial input and draining final frames.
- Verify: `node --test tests/ron-workflow/codex-host-driver.test.mjs`

### Outcome 2: recoverable request boundaries
- Work: Preserve received, dispatched, returned and forwarded states before corresponding effects, with original-ID owner reconciliation for uncertainty. The current host loses active-cell store updates on termination, so publish payload-free identity/progress checkpoints through existing shell capabilities before effects. Keep native arguments/results and bridge-token-bearing transport only in memory; restore omitted data from its original owner. Keep heartbeats during slow calls, Run-qualified controls, bounded reads and the existing tool allowlist. Extend the bridge only for request-state observation and delivery acknowledgement; it remains the native request owner.
- Verify: `node --test tests/ron-workflow/codex-host-driver.test.mjs tests/ron-workflow/codex-host-bridge.test.mjs`

### Outcome 3: supported loading and packaged verification
- Work: Replace the Markdown implementation with a small loader for the same tested code. Require its assets in immutable installation and record a bounded live current-host loading/transport observation separately from fixtures. Use an isolated probe without starting another coordinator or changing the current installed package.
- Verify: Changed installation tests, all `tests/ron-workflow/*.test.mjs`, syntax checks for changed scripts, and `git diff --check`. No typecheck command is configured in `package.json`.

## Execution binding

- Issue: `I_kwDOTh5gv88AAAABQLvdCA` (#75); Spec: `I_kwDOTh5gv88AAAABQLpmPA` (#72).
- Run: `workflow-op-v1-542b78a33fd30e920bc2483be65d394f83e88dd84d176daebd70f7e313040bb2`.
- Operation: `workflow-op-v1-884cf78ee23651bb454153c11ffe8304851cf87d5779cfa95372593dfd84114c`.
- Baseline and Planning Seal: `0dd5111da99b2a719b8085ef76be0c2818e95e1a`; target: `features/ron`.
- Adopted sole worktree: `C:/Users/ron.chang/.codex/worktrees/d182/skills`; topic: `codex/issue-75-host-driver`.
- Git common directory: `C:/Workspace/open_source/skills/.git`; task: `01a07ee2-00c5-7090-b2e3-cbc6c26d147c`.
- Initial worktree and target were clean. Grant, dispatch, publication mapping, Issue body digest and seal ancestry matched before mutation. Repair waves: 0.

## Conflict recovery attempt

- The close owner restored the clean target after a conflict in `codex-host-bridge.mjs`; original candidate `fe72a1be7a3ebe2cf4a9ec4b6398a33c3038f27f` and its completion evidence remain preserved.
- New execution baseline: `18af670f35ad5c5c3ee3e84e2a41ea0de0e0b10f`. Merge this exact baseline into the original topic without rebase or reset. The replacement candidate must contain both the baseline and the previous candidate.
- Recovery request: `sha256:d092df334e9b78e013c0e9529b7365442e42eafd25f2fc6c27d456f8c0719a07`. Coordinator conflict-repair wave: 1/10. Issue cumulative repair waves: 2, including the earlier review repair.
- Preserve the incoming host-release capability declaration and the single driver-owned tool allowlist. Their behavior is compatible; no AC, exclusion, target or owner changes are needed. Any semantic scope conflict stops this lane.
- Verify the merged combination with driver, bridge and installation focused tests, the repository workflow suite, changed-script syntax and diff checks. Obtain new independent Standards and Spec review against this baseline. Prior live observations remain historical evidence; do not relabel them as a new live run.
- Completion ends at one new read-back implementation receipt. Integration, cleanup and tracker closure remain with the close owner.
