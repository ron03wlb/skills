# Issue 82: Bounded review source scenarios

## Evidence boundary

On 2026-09-09, independent subagent `/root/review_scenarios` received nine synthetic snapshots with no inherited conversation. It read the candidate `skills/engineering/code-review/SKILL.md` as evaluation data and the formal caller from immutable workflow package `852bd245fbd94b8a7a815de4a52e036cfa691f97c1169fddff6e604ef53ea90f`. It was instructed to avoid tracker operations, real workflow actions, edits, tests, and further delegation. It did not receive the regression tests or expected results.

The task asked for governing requirements/provenance, separate Standards/Spec disposition, required input/setup, and observed versus proposed actions for each case. Every synthetic candidate was fixed and nonempty; relevant Standards were stipulated clean. Source contents below were supplied snapshots, not fetched live resources. These are observed model responses to bounded instruction scenarios, not execution of real product code or proof of general model reliability. The separate Node tests assert instruction structure only; there is no automated behavior interpreter presented as the skill itself.

## Inputs and observed results

### S1: Explicit conversation versus discovered Issue (AC-1)

- Input: conv-A human turn 1: “Return an empty list when no matches exist.” Human turn 2: “Review against our accepted conversation requirements.” Candidate returns `[]`; discovered commit says “Closes #9,” whose captured requirement instead says `null`.
- Observed: Conversation turns 1–2 govern. Standards and Spec clean with zero confirmed findings. Issue #9 does not override the designated conversation. No new input or tracker setup needed.

### S2: Explicit file versus commit reference (AC-1)

- Input: Human designates `spec.md@abc`, line 4: “Return an empty list when no matches exist.” Candidate returns `[]`; commit references #9 requiring `null`.
- Observed: The designated file governs; Standards and Spec clean. Commit reference is supporting context and does not replace file authority. No new input or tracker setup needed.

### S3: Explicit Issue versus repository document (AC-1)

- Input: Human designates Issue #12, captured revision v3, AC-1: “Return an empty list when no matches exist.” Candidate returns `[]`; `legacy-spec.md` requires `null`.
- Observed: Issue #12 v3 governs; Standards and Spec clean. The repository document cannot override the designation. The provided captured Issue contents suffice for this synthetic review.

### S4: Designated source unavailable (AC-1, AC-3)

- Input: Human designates inaccessible `spec-private.md`; a discovered readable Issue #9 requires `null`. Candidate returns `[]`.
- Observed: Standards clean; `Spec not assessed`. Issue #9 cannot substitute. The response requested readable designated content with truthful provenance as the input needed for Spec assessment; it did not require tracker setup merely for a file limitation.

### S5: Designated sources conflict (AC-1, AC-3)

- Input: Human designates both `A@a` requiring `[]` and Issue #12@v3 requiring `null` for identical no-match behavior, without a precedence decision. Candidate returns `[]`.
- Observed: Standards clean; affected Spec requirements remain unassessed. The response retained both sources and identified a human precedence/reconciliation decision as necessary, without choosing the source matching the candidate.

### S6: Frozen packet without inherited conversation (AC-2)

Input transcript, task conv-B:

| Turn | Speaker | Exact statement |
| --- | --- | --- |
| 1 | Human | Export only active accounts. |
| 2 | Assistant | We could also add XLSX export. |
| 3 | Human | Use CSV. |
| 4 | Assistant | I assume UTC timestamps. |
| 5 | Human | Yes, CSV is the format. |

Candidate exports active accounts as CSV with UTC timestamps and no XLSX support.

Observed packet: human turns 1 and 3 are requirements; human turn 5 confirms CSV. Assistant turn 2 remains an unaccepted XLSX proposal. Assistant turn 4 remains a UTC assumption, which turn 5 does not accept. The reviewer quoted all five statements with their speaker and turn provenance. It assessed the active-account and CSV requirements clean and treated UTC as assumption context rather than a proven mismatch. No physical Spec, Issue, renewed approval, or tracker setup was required solely to review.

### S7: General review without requirements or tracker (AC-3)

- Input: Standalone general review; no designated requirements, applicable conversation, commit references, repository Spec, or `docs/agents/issue-tracker.md`. All relevant Standards assessed without confirmed findings.
- Observed: Standards assessment can complete clean; “Spec not assessed: no applicable requirement basis.” The response explicitly excluded a Spec pass and complete acceptance, with no mandatory clarification or tracker setup.

### S8: Formal delivery with missing published Spec (AC-4)

- Input: `execute-issue` requires an inaccessible governing published Issue. A readable conversation describes the candidate behavior, and Standards review is clean.
- Observed: Formal Spec remains unassessed and review incomplete; `implementation_complete` is unavailable. A separately labeled conversation assessment cannot replace published authority. Recovering governing evidence and completing the formal gates were proposed prerequisites, not performed actions.

### S9: Conversation changes published scope (AC-4)

- Input: Published Issue AC-1 requires CSV only. The human later accepts an XLSX proposal in conversation, but no published-scope revision has occurred. Candidate exports XLSX only.
- Observed: Published CSV-only scope governs formal delivery. Standards clean; Spec has one confirmed mismatch. The response retained the planning/revision route, withheld `implementation_complete`, and did not claim to publish or execute that route.

## Assessment and limitations

All nine responses met their relevant source-selection, provenance, and assessment boundaries. The evaluator reported no demonstrated instruction defect. The coordinator checked these responses against Issue #82 AC-1 through AC-4; AC-5 additionally relies on structural tests and final instruction/docs/metadata review.

This run did not exercise real inaccessible tracker permissions, large conversation truncation, repeated stochastic model trials, or all host/model combinations; those cases remain unverified. It measures no token, latency, cost, or intervention improvement. Final committed-candidate test results and independent Standards/Spec review evidence belong to Issue #82's execution receipt, avoiding a self-referential candidate SHA in this report.
