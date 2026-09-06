# Run recovery

Read this reference only when dispatch, tracker, environment, writer, or coordinator evidence cannot follow the happy path. It solely owns retry budgets, outage probes, recognized automatic remediation, and terminal diagnosis fields. It grants no ambiguity repair or target mutation.

## Worker and tracker recovery

A transient worker or task failure permits at most three dispatch attempts per Issue. Reuse a reachable task. Create a replacement only when the prior task is proven unable to continue and append one `retry.recorded` relationship with exact inactive evidence. Semantic failure, `implementation_blocked`, merge conflict, Scope change, authority mismatch, and contradictory evidence bypass the retry budget.

Before a same-task retry, reacquire task history. An exact accepted retry follow-up for the same Run, Issue, and next attempt is already in flight; journal the recovered relationship without sending the prompt again.

Cached tracker data never authorizes progress. After initial failure, make 5, 15, and 30 second tracker probes; those probes do not consume the Issue retry budget. Running workers may settle locally but stop at the next tracker-dependent boundary. On recovery, discard the outage snapshot and fully reconcile. After all probes fail, return `tracker_unavailable` with schedule, affected nodes, next owner, and Resume predicates.

On restart, resolve any selector-known Run identity and node set locally before the first Tracker read. If every probe fails, preserve that known Run and affected nodes rather than returning an anonymous outage.

## Writer and environment recovery

Unknown repository-close or target-writer ownership, coordinator loss, or changed immutable authority after the wait is a Recoverable blocker. Report the owning source, exact evidence, smallest human action, preserved Run and Issue stages, and the same `/run-issue-workflow` retry. Elapsed time never grants reclaim authority.

The only automatic environment adapter is the Windows Gradle case: a `Selector.open()` probe whose exact result includes `java.io.IOException: Unable to establish loopback connection` may invoke `gradle-loopback-safe` for one reversible, process-local remediation cycle. Every other failure remains untouched. A repeated exact fingerprint in one attempt becomes `environment_unresolved`; later valid attempts classify independently. A legacy `remediation.recorded` without `attempt` belongs only to the latest preceding dispatch for that Issue. Missing, mismatched, future, duplicate, or ambiguous evidence fails closed without journal rewriting.

## Stop with a diagnosis

Stop at `SUCCEEDED`, `STOPPED`, or any state with no legal action. Every blocked, failed, or paused result reports the stable reason code, exact evidence, attempted recovery, retry count, affected and unaffected nodes, next owner, no-automatic-transition statement, and Resume predicates.

This coordinator is not a background daemon, global scheduler, public plugin surface, aggregate push gate, deployment path, external-prerequisite runner, or self-modifying workflow. Shared leaf repair requires a separately authorized Issue and later explicit re-entry.


Healthy waits continue across bounded observations and preserve their journaled owner across re-entry. Normal target HEAD movement and ordered close progress are refreshed. Current native task and Git evidence are read before deciding whether an uncertain create, message, merge or close needs retry; no cached status or absent response proves failure.

Known JSON encodings of existing owner records are read without rewriting them. Missing operation/artifact fields follow their independent exact legacy frontiers or genuinely unadopted scope; no historical Grant, review or completion is invented. Conflicting Issue evidence isolates that Issue and its transitive dependants. A known compatible current runtime records its actual version while preserving the original Grant and retained content.
