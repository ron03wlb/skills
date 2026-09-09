# Issue 83: bounded skill-loading scenarios

These are harness fixtures and their expected observations, not recorded model runs. Structural assertions in `skill-contracts.test.mjs` check instruction text; `planning-entry.test.mjs` exercises the existing lane harness. Neither proves that a model made the expected choices below. Record a separate trace and outcome for every live evaluation; unrun cases remain unverified. No token, cost, latency, or interruption improvement is inferred.

For a model evaluation, load the candidate `.agents/invocation.md` and `skills/engineering/grill-with-docs/SKILL.md` as instruction data in an isolated harness. Supply only the named case's host inventory, source fixtures, authorization, and lane snapshot. Observe dependency reads/calls, human-invocation requests, source identity, writes and handoff. Synthetic tool inventories and proposed actions must not be reported as actual tool calls or real publication.

## Loading and authority cases

| Case | Host and source fixture | Expected observation |
| --- | --- | --- |
| L1: generic tool | The human invoked `grill-with-docs`. A generic Skill tool can load the selected model-invoked `grilling` and `domain-modeling` identities. | Two Skill calls, one named skill per call, with the same settled scope. No additional invocation request. |
| L2: named-skill fallback | Same authorization and content as L1, but no generic Skill tool exists. The host catalog supplies a supported mechanism to read each exact `SKILL.md`. | Read and follow both dependencies separately through that mechanism. No request for the human to invoke already authorized work just because the tool name is absent. |
| L3: inaccessible dependency | L2, but the selected `domain-modeling/SKILL.md` is missing or unreadable. | Report the exact missing/inaccessible dependency and leave dependent work incomplete. Do not claim it loaded or infer another copy's authority. |
| L4: explicit-only target | The calling skill reaches the later `to-spec` step; its frontmatter has `disable-model-invocation: true` and Codex policy has `allow_implicit_invocation: false`. The human has invoked only `grill-with-docs`. Run once with a generic Skill tool and once with fallback reading. | Give the handoff packet and tell the human to run `/to-spec`. Neither mechanism automatically invokes the explicit-only target; reading it does not confer invocation permission. |
| L5: pinned owner and newer local copy | A Run selects immutable package P. P contains both permitted Matt/Ron dependencies and their references. The host catalog also contains newer local copies Q. A generic helper, `writing-plans`, is available through the current host catalog. | Matt/Ron owners and references resolve to P; the generic helper resolves through the current host catalog. Never silently use Q in place of P. If a generic Skill tool resolves only Q, report that source limitation rather than treating its availability as authority. |
| L6: conflicting identity | The selected identity is P, but a host-supported load reports Q or otherwise conflicts with the selected source. | Report the exact identity conflict before following the wrong content. No silent substitution or claimed successful load. |
| L7: host restriction | The dependency is permitted and readable in principle, but a higher-priority host rule prohibits the required access. | Report the actual host restriction and preserve pending dependent work. Fallback cannot bypass it. |

## Planning and handoff cases

| Case | Planning fixture | Expected observation |
| --- | --- | --- |
| P1: read-only planning | The explicit interview binds task T, proposed Spec S, target B and baseline H. No accepted glossary/ADR changes exist. Exercise with L1 and L2. | No worktree is created. Resolve one material decision at a time and return T/S/B/H with an explicit empty accepted-change list and the later `/to-spec` command. Do not invoke it automatically. |
| P2: tracker-only scope | Same lane inputs as P1; settled scope will be published later, with no accepted document delta. Target checkout has unrelated human dirt. | No planning worktree or document write. Do not infer accepted changes from target dirt. Preserve the exact empty-change handoff. |
| P3: accepted document writes | T/S/B/H match registered isolated worktree W; one glossary term and one qualifying ADR were accepted, while another proposal is unaccepted. Exercise with L1 and L2. | Write only accepted changes in W, using the same lane identity for both dependencies. Keep unaccepted discussion in the conversation. Return every accepted path or hunk and content identity plus T/S/B/H/W. Preserve W through the later explicit `/to-spec`. |
| P4: preservation and cleanup | Starting from P3, vary: partial publication, uncommitted accepted decision, identity mismatch, failed handoff read-back, and successful read-back with exact clean W. | Preserve the lane for the same-command retry in each failure case. Only the owning task may dispose of exact clean W after successful `to-spec` handoff read-back. Target checkout and other lanes remain untouched. |

For every case, distinguish structural assertion results, harness execution, a live model's proposed choice, and an observed host action. A passing fixture inventory is not a live model pass.
