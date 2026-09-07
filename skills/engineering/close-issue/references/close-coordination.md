# Close coordination

Read this reference for every close attempt after entry identity is bound and before either lease is acquired.

Within the same Git common directory, closeouts for different targets use one repository close lease; different repositories remain concurrent. The target mutation writer serializes planning producers and closeout on the exact target; Issue execution, planning on unrelated targets, and Issue worktrees never acquire the repository close lease.

On healthy contention, observe the exact owner and boundedly retry without lease stealing. Unknown ownership or stale-proof mismatch stops the affected closeout. After a release, re-read every entry identity and mutation precondition before acquisition; a healthy acquisition race returns to observation. A healthy owner may continue across observation windows. Elapsed time never requires a new human invocation and never authorizes stealing. Reclaim only with exact owner-inactivity and abandoned-operation proof.

Acquire repository lease before target writer. Release the target writer before repository lease, and release both only after required action read-back or a verified pre-mutation stop. A release or fencing failure reports exact ownership and stops. These mechanics neither create a close, merge, execution, review, verification, push, deployment, prerequisite, nor Scope authority.
