# Close result lines

Read this reference only for a coordinator-hosted close or a merge-conflict stop. Shared close mechanics stay in [executable closeout](executable-closeout.md).

A coordinator returns exactly one native final-answer line `Workflow close result: <JSON>` with `schema: issue-close-result:v1`, exact `runId`, `issueId`, accepted `requestIdentity` and candidate, plus the state-specific fields:

- `state: CLOSED`: returned `deliveryProgress: {repositoryCloseAcquiredAt,targetWriterAcquiredAt,closeCompletedAt}`. These distinct owner timestamps show progression but never replace fresh Git/tracker/worktree/lease preconditions.
- `state: CONFLICT`: pre-merge `targetHead`, `targetRestored: true`, and conflicted paths. The coordinator transfers repair ownership; closeout never repairs.
- `state: INTEGRATION_FAILED|INTEGRATION_UNKNOWN`: `integrationVerification: {state,issueId,candidate,targetHead,identity}`.

Extra, malformed or unverified fields become `UNCLASSIFIED` diagnosis, never a persisted close result.
