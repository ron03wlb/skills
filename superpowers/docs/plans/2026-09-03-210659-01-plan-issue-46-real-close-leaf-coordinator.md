# Issue 46: Real close-leaf coordinator

**Goal:** Make the DAG coordinator observe and wait for closeout availability while the real `close-issue` leaf exclusively acquires repository and target mutation leases.
**Why planning is required:** The change alters concurrent workflow authority, lock ownership, recovery state, and public coordinator behavior.
**Acceptance:** The coordinator never acquires or releases either closeout lease; legal Issue dispatch remains governed only by each Run's `max_parallel`; repository-close contention waits outside execution capacity with bounded, same-command recovery; every close invocation follows fresh tracker, target, candidate, completion, worktree, control, and Grant read-back; no queue, lease stealing, push, deployment, or target integration is introduced.

### Outcome 1: Leaf-only closeout ownership
- Work: Remove coordinator-side target-writer acquisition and reclaim paths. Invoke the executable-Issue and parent close leaves only after current closeout availability and authority evidence are established, and bind requests to the exact Run, Issue, target, and completion candidate.
- Risks/open questions: A coordinator-held lease would deadlock the non-reentrant real leaf. Unknown or changing owners must stop without reclaiming or releasing another operation's lease.
- Verify: `rtk node --test --test-name-pattern="real close leaf|double acquire|fresh evidence" tests/ron-workflow/run-issue-workflow-coordinator.test.mjs tests/ron-workflow/run-issue-workflow-end-to-end.test.mjs`

### Outcome 2: Bounded repository-close waiting outside execution capacity
- Work: Model repository-close observation and bounded waiting independently from Issue execution slots and retry counts. Dispatch every currently legal Issue before waiting, preserve one invocation across timeout or coordinator loss, and reacquire all mutation evidence after release.
- Risks/open questions: Existing target-writer wait journals are immutable compatibility evidence and must remain readable; new state must not create a queue, daemon, waiter registry, or fairness promise.
- Verify: `rtk node --test --test-name-pattern="repository close wait|max_parallel|same-command" tests/ron-workflow/run-issue-workflow-coordinator.test.mjs tests/ron-workflow/run-issue-workflow-end-to-end.test.mjs`

### Outcome 3: Synchronized owner-local contract and complete evidence
- Work: Synchronize the personal Skill, operator guidance, domain vocabulary, examples, and focused tests. The repository forbids a `docs/personal` page, so no such page will be created; existing owner-local documentation is the authoritative documentation surface for this non-promoted Skill.
- Risks/open questions: Public state and event names must distinguish repository-close waiting while preserving frozen legacy target-writer wait data.
- Verify: `rtk node --test tests/ron-workflow/run-issue-workflow-coordinator.test.mjs tests/ron-workflow/run-issue-workflow-end-to-end.test.mjs`
- Verify: `rtk node --test tests/ron-workflow/*.test.mjs`
- Verify: `rtk git diff --check`

## Verification outcome

- Focused ownership, concurrency, fresh-evidence, and same-command cases: 12 passed, 0 failed.
- Complete Ron workflow suite: 185 passed, 0 failed.
- Changed runtime syntax checks, waiting-example JSON parse, and `git diff --check`: passed.
- Generic `quick_validate.py` is not applicable to this existing personal skill frontmatter: it rejects the repository-required `disable-model-invocation` key that is unchanged from the Execution baseline. Repository contract validation passed in the complete suite.
