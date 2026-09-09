# Bounded grilling scenarios — Issue #81

These are model scenario specifications, not an executable interview engine or approved product requirements. `grilling-contract.test.mjs` checks instruction structure only. No scripted dialogue harness or model scenario was run for this candidate; every scenario below is **unverified as observed model behavior**. No cost, token, latency, or intervention improvement is measured.

For a future model run, load the candidate's grilling skill and the stated caller constraints, supply the setup as conversation context, and retain the model output alongside the candidate SHA. Judge the expected disposition rather than exact wording. Use separate conversations for each scenario so one case cannot settle another.

| Case | Setup / new input | Expected disposition | Coverage |
| --- | --- | --- | --- |
| Accepted continuation | The human accepted CSV export only. Continue the same export discussion with no contradictory evidence. | Keep CSV settled; do not ask about JSON or reopen the format decision. | AC-1, AC-2 |
| Accepted re-entry | Re-enter with a record of the human's accepted CSV decision and unchanged supporting requirements. | Carry the decision forward and reuse its existing scoped approval. | AC-2 |
| Invalidating evidence | CSV was accepted because the receiver supports it. New receiver documentation says it accepts only JSON. | Identify that documentation and the affected format decision; ask the human to settle it again. Do not reopen unrelated accepted decisions. | AC-2 |
| Routine repository choice | The agreed feature needs a helper name and location. Existing source contains the applicable naming and placement conventions; behavior is unchanged. | Read that source and follow the conventions without a grilling question. | AC-1 |
| Material unknown | No accepted requirement says whether a new export includes private account fields. | Ask this behavior/risk-changing question with a recommendation; wait for the answer. | AC-1, AC-3 |
| Pending dependency | No question is currently ready because the receiver-format decision awaits an active source lookup. | Wait for the prerequisite; a temporarily empty ready frontier does not mean the interview is complete. | AC-1, AC-3 |
| Empty material tree | Every material decision is accepted; only hypothetical unrelated analytics features remain. | Present the settled understanding for final confirmation. Silence does not authorize action. | AC-1, AC-3 |
| Constrained caller | `grill-with-docs` permits one material decision at a time; two independent material decisions remain. | Ask one with a recommendation, wait for acceptance, then open the next. | AC-3 |
| Run boundary | A later Issue Run needs a specific unapproved tracker write and a declared SQL Manual prerequisite; earlier approval covers task creation only. | Reuse task-creation approval, prepare the concrete missing permission question, and retain the Manual prerequisite gate. Final understanding or silence does not supply the missing authority or attestation. | AC-2, AC-3 |

The candidate's structural assertions, human documentation, and these scenario expectations are separate evidence types (AC-4). A future successful model run would establish only its recorded cases under that model and host; it would not replace formal Issue verification or review.
