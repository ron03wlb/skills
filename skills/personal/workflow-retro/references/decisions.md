# Findings, decisions and handoff

## Report shape

Start with cutoff, source inventory, sample size/IDs and separate inventory/history coverage limits. Report observed counts only; a partial sample supplies no population-wide rate or invented time savings.

Each finding contains:

- Stable finding ID and linked episode IDs; episode count and distinct host/task count separately.
- Requested/pending outcome, minimal redacted evidence locators, observed cause versus hypothesis, confidence and missing or conflicting evidence.
- Historical source/version and current source/version; whether the defect persists, is corrected or remains unknown; current owner (skill, instruction, interpretation, runtime, tool or environment).
- Observed material impact, recurrence, recovery feasibility and dependencies. Group episodes only when they establish the same cause, not merely the same error text or “interrupted” status.
- Minimal recommended change, meaningful alternatives with tradeoffs, and acceptance plus regression checks at the real behavior seam.

Rank supported material impact first, then recurrence and confidence; use finding ID for equal-evidence ties. Explain the ordering instead of inventing a numerical score. Separate actionable candidates, necessary stops and unresolved evidence. Retain a historically corrected finding as context or deployment-verification follow-up, not as an unproved current code defect.

## One decision at a time

Maintain a compact decision ledger in this conversation: finding ID, proposed scope revision, disposition, user's exact decision locator, settled choices/tradeoffs, target and unresolved prerequisites. Present one material decision with a recommendation and await its dependent answer. Silence is not acceptance. Independent evidence reading may continue while an answer is pending; dependent design or a ready handoff may not.

On continuation, reuse the frozen sample, episode IDs and accepted choices. Ask again only if new evidence changes that decision's material scope, explaining the change. Each presented candidate ends accepted, deferred, rejected or explicitly unresolved with the missing evidence and next owner. A user may end the retrospective with remaining candidates explicitly unresolved; preserve the ledger and partial completion, not a claim that all handoffs are ready. Deferral/rejection ends that candidate without requiring an implementation Spec.

## Human to-spec handoff

For each candidate accepted for implementation, produce this settled packet:

```text
Finding and accepted scope revision:
Decision and authority locators:
Outcome and exclusions:
Evidence: cutoff, sample/coverage, host/task/turn/event/result locators,
          redacted excerpts, historical and current source paths/versions:
Intended repository identity, local path, target ref and verified full baseline SHA:
Relevant baseline facts and observation time:
Recommended change, chosen alternatives and tradeoffs:
Acceptance ideas and regression/verification commands or seams:
Recovery fingerprint, prerequisites, current owner and proposed effect:
Permission/recovery boundaries and required future contract changes:
Accepted glossary/ADR changes (exact paths/content identities or explicit empty list):
Unresolved prerequisites and their owning source:
Readiness: ready or unresolved (exact missing evidence):
Next human command: /to-spec with this packet
```

Verify the intended repository and target baseline read-only from Git (`rev-parse`, relevant source reads); a guessed repository or moving branch label is not a verified baseline. Resolve a missing target with the human before calling its handoff ready. Keep independent repositories in separate packets; record cross-target dependencies without inventing a common target or bundling independent outcomes. A missing target does not reopen an already accepted improvement decision.

The packet is a discovery result for a human `/to-spec` invocation, not a Spec publication, Run Grant or permission to repair. Preserve unresolved execution prerequisites for the planning owner. Deliver packets in this conversation and stop; no automatic invocation of user-only skills, tracker writes, implementation, installation, task messages or background automation.
