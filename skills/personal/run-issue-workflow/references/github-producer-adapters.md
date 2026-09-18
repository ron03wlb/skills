# GitHub Spec producer binding

This binding supplies the planning, checkpoint, tracker and handoff adapters for `to-spec@v2` publication, including exact accepted-document Planning Seals. It supports primary reservation and revision of the same existing Spec. It does not classify a Spec, grant approval, decompose children, or provide an automatic GitHub Run host. Those operations keep their existing owners.

## Configure once, inspect without mutation

Resolve this reference and its sibling scripts from the current harness's installed personal coordinator. Do not substitute another checkout or a per-Run script. The package must include `github-producer-entry.mjs`, `github-producer-adapters.mjs`, `github-producer-transport.mjs`, `github-producer-mutations.mjs`, `github-workflow-records.mjs`, `git-planning-seal.mjs`, the existing Run store, checkpoint and operation-identity modules, and the `to-spec` planning entry.

After explicit authorization to bind a repository, run from any directory:

```text
node <installed-coordinator>/scripts/github-producer-entry.mjs configure <repository>
node <installed-coordinator>/scripts/github-producer-entry.mjs inspect <repository>
```

`configure` reads the HTTPS or SSH origin and the authenticated GitHub identity, then creates or reuses `docs/agents/github-producer.json`. It preserves an existing binding and rejects a different repository. The file contains one static repository identity and no credentials, Spec IDs, task IDs or receipts:

```json
{
  "schema": "github-producer:v1",
  "repository": "owner/repo"
}
```

Credentials remain in the configured `gh` account. `inspect` only reads this file, the remote, repository and authenticated identity. It creates no producer state and reports the source that is missing or mismatched. It does not prove write permission or Run readiness. Setup diagnostics may invoke `inspect`; they must never invoke `configure`.

## Invoke the owner adapters

The reusable CLI accepts one structured JSON request through stdin:

```text
node <installed-coordinator>/scripts/github-producer-entry.mjs invoke <repository>
```

Every request carries `action`, `target` (local branch name), `publication`, optional `specId` (project Issue number, immutable Issue node ID, or exact configured Issue URL), and the action's `request`. `publication` has the approved `title`, exact canonical `body`, `classification: SINGLE|MULTI`, and optional `readyLabel` (default `ready-for-agent`). The configured label must already exist. The owner still validates its template, AC mappings, approvals, SQL preparation and authoritative next command before mutation.

The same API is available as `createGitHubProducerAdapters({repository, configuration, transport, specId, target, publication})` from `scripts/github-producer-adapters.mjs`. An injected `transport` is a fixture seam, never a production substitute for GitHub read-back; an injected `execute` is a fixture seam for the capability probe.

| CLI action | Adapter | Request and result |
| --- | --- | --- |
| `reserve` | `tracker.reserve` | Primary: `{mode:"primary", proposedSpecIdentity}` with no `specId`; returns the reserved Issue node identity and version. Revision: select the existing `specId` and use `{mode:"revision"}`. |
| `read` | `tracker.read` | Returns native Issue node ID, body, labels, comments and opaque `version`. |
| `baseline` | `planning.readBaseline` | `{baseline, trackerVersion, relevantFacts, acceptedChanges:[]}`. Facts map relevant normalized repository file paths to `git-blob:<object-id>` from the settled baseline. Returns the existing planning entry's `COMPATIBLE` or `DRIFTED` result. |
| `identity` | `checkpoint.identity` | `{baseline, relevantFacts, sealOperationId?}` using the revalidated baseline or written seal SHA and returned facts. Preserve the exact returned current `to-spec@v2` identity for all retries. |
| `checkpoint-read` | `checkpoint.read` | The exact identity object; returns zero or one matching transaction. |
| `checkpoint-create` | `checkpoint.create` | The same identity; uses the existing operation-scoped store. An observed downstream record without its transaction stops. |
| `seal` | `planningSeal.read` | `{identity}`; independently verifies the reused seal and relevant current source. Returns `{target, planningSeal, state:"reused"}`. |
| `checkpoint-advance` | `checkpoint.advance` | `{identity, stage, receipt}`; independently reads the stage's owning evidence before passing the exact receipt to the store. |
| `publish` | `tracker.publish` | `{identity, expectedVersion, expectedLabels}`; preserve the version and labels from the same pre-publication `read` for retries. Requires the exact Planning Seal stage. Returns a native publication comment identity, comment-body digest, observed version and scope bindings. |
| `mutation-read` | `tracker.readMutation` | The same `{identity, expectedVersion, expectedLabels}`; reads the publication body intent and latest attempt/result without creating state or contacting the tracker. Reports `UNATTEMPTED`, `REJECTED`, `ACKNOWLEDGED`, or `UNRESOLVED`. The entry still reads the configured identity and validates the current source. |
| `handoff-append` | `handoff.append` | `{identity, preparation}`; requires completed publication read-back. Preparation is the already verified owner packet, not generated permission. Returns native handoff identity and digest. |
| `handoff-read` | `handoff.read` | `{identity}`; validates the publication checkpoint and reads zero or one exact handoff. |

Order: resolve/reserve the tracker identity, revalidate baseline, read/create the exact producer transaction, read and advance `planning_seal.read_back`, publish and advance `publication.read_back`, append/read handoff and advance `handoff.completed`. Re-entry preserves the identity and starts at the first unsatisfied stage after reading earlier receipts. Do not regenerate its baseline or scope bindings merely because an unrelated target commit moved.

Revision never reserves a replacement Issue. Primary reservation retains its native Issue node identity locally so retry still selects it after the draft marker is replaced by the canonical body. Tracker-only publication reuses the seal without an empty commit.

## Proven publish capability

Before its first mutation the adapter proves the capability it publishes through (Spec Constraint 10). `proveGhCapability` reads one repository through `gh api --paginate --slurp` and reads the authenticated identity with `gh api user`; it records that observation on the `spec_publication` record as `capability`. When either probe is unproven it returns one exact attributable `GITHUB_PRODUCER_MISSING_CAPABILITY` naming the surface and `setup-matt-pocock-skills` as the owner that must repair it, instead of attempting the write. GitHub reports `READ_WRITE_READBACK`, never atomic CAS.

Reads use `gh api <path> --paginate --slurp` and flatten the page arrays; a JSON write is sent over stdin with `gh api --method <METHOD> <path> --input - --include` so the exact HTTP status of a terminal rejection is observed. Provider stderr and response bodies never enter receipts or logs. The adapter never interpolates a multiline JSON payload into a shell argument.

## Seal accepted documents

Only the explicit `to-spec` owner may register its accepted handoff, and only that owner disposes the lane, after the handoff it produced has been read back. Registration records provenance; it grants no new scope. Supply a user-visible handoff file and its `sha256:<hex>` identity, and preserve any prior lane registry. The owner must verify that every declared document is accepted, including inherited decisions and generated documentation; dirt alone is never scope evidence. Supported whole-file paths are `CONTEXT.md` and Markdown/HTML under `docs/`. Runtime source, SQL, deletion, operational plans and unaccepted drafts remain outside this writer. For a partial-file handoff, prepare a separately reviewed exact document in the owned lane first; do not expand hunk authority automatically.

| CLI action | Request and result |
| --- | --- |
| `lane-register` | `{taskId, worktree, baseline, authority:{path,contentIdentity}, acceptedChanges:[{path,contentIdentity}]}`. SHA-256 identities cover exact file bytes. Independently checks the common Git directory, native worktree registration, isolated lane HEAD, handoff and files; freezes baseline blobs and modes. Returns `{registrationId,taskId,worktree}`. Exact registration retry reuses the immutable record. |
| `lane-read` | The returned lane object. Rechecks its exact registration and content and supplies the generic planning entry's lane evidence. |
| `lane-dispose` | The same lane object. Re-proves that exact registered lane and requires it to hold nothing beyond its accepted documents, removes only that planning worktree and deletes no branch, then reads back registration and directory absence. A repeat after a lost response returns the satisfied action; a registration/directory disagreement, unaccepted lane content or an unconfirmed removal stops and preserves what remains. |
| `baseline` | With documents, include `lane` and the same nonempty `acceptedChanges`; keep the lane's original `baseline`, and declare current relevant facts explicitly. Compatible unrelated target movement returns the latest target SHA. |
| `seal-write` | The same baseline request. Acquires the shared target writer, revalidates facts, commits the exact documents and fast-forwards the recorded target checkout. Returns `{target,planningSeal,state:"written",operationId,relevantFacts}`. Facts include the committed documents. |
| `seal` | `{identity}` with `bindings.sealOperationId`. Reads the retained candidate, exact parent/diff, immutable registered content, target ancestry and current document blobs; returns the writer-owned receipt. Completed receipts remain readable after the handoff owner disposes its lane. |

After `seal-write`, finalize the canonical Spec body with its returned seal SHA; then create the publication identity with `baseline:planningSeal`, the returned `relevantFacts`, and `sealOperationId:operationId`. Document provenance binds the repository, Spec, target and accepted handoff independently of the later canonical publication body. The transaction subsequently binds both identities. Never regenerate a started publication identity to accommodate body changes.

The writer uses the existing Run store's target mutation lease, a private Git index, one candidate commit and native `merge --ff-only`. It preserves unrelated unstaged/untracked files and the original lane; a staged target index, overlapping dirt, target movement or document preimage change stops without stashing or discarding work. A preimage conflict requires the owner to reconcile the accepted document against the new target before a newly reviewed registration. Unchanged declared files must be removed from the accepted delta rather than producing an empty seal.

## Evidence and uncertainty

The checkpoint's approved publication identity hashes the approved title, canonical body, classification and effective ready label together. A title-only revision therefore has its own operation, while an exact retry retains the same identity. `authority.approvedScopeHash` separately hashes only the canonical body. Publication records bind the exact expected post-write label set (the observed pre-write labels plus the ready label); both initial read-back and retries verify that set.

The repository identity is `github:<owner>/<repo>`; Spec identity is the immutable Issue node ID, and the adapter resolves a number or configured Issue URL to it before binding. Publication and handoff records use one `workflow-record` JSON fence read through `github-workflow-records.mjs`. Only comments authored by a repository OWNER, MEMBER or COLLABORATOR are accepted, and each record's comment node ID plus SHA-256 of its exact body identify the immutable observation. Duplicate, malformed, foreign or changed records stop rather than merging evidence.

Local mutation intents contain hashes and operation identities, not Issue bodies or credentials. Attempts and sanitized results are appended beside the immutable original intent. Results retain HTTP status and a validated request ID; response bodies and stderr are discarded. `ACKNOWLEDGED` means the transport returned successfully, not that publication or a checkpoint completed: exact owner read-back still supplies that proof.

### Recover a rejected write

On `GITHUB_PRODUCER_REJECTED`, inspect the recorded HTTP status/request ID and repair the cause. The transport recognizes only explicit terminal client-rejection statuses; timeouts, malformed responses and server errors remain unresolved. The owning producer may then explicitly supply `retryRejected:true` to the same `reserve`, `publish`, or `handoff-append` request. Every retry binds the original intent fingerprint, claims a new attempt exclusively and revalidates the owner's existing authority/read-back checks. A further failure requires its own result; a timeout after a prior rejection does not inherit permission to retry. Publication preserves the original `expectedVersion` and `expectedLabels` and rechecks them immediately before the update. The explicit retry flag is not approval of new scope or changed content.

For a publication body failure, `mutation-read` identifies the exact local state. A rejected publication/handoff comment carries its own operation-kind intent and status; retrying its owning action reads existing records before attempting the missing comment. Primary reservation similarly preserves its proposed-Spec identity.

A response lost after an applied write is resolved only by exact owner read-back. If a retained intent has no matching result, stop as `GITHUB_PRODUCER_UNKNOWN`; never blindly resend, delete the intent, or infer failure from absence. In particular, legacy intents without attempt/result evidence stay `UNRESOLVED`, even with `retryRejected:true`. Preserve the draft, original request, checkpoint and intent; report that terminal provider evidence is missing to the publication owner. This entry does not import human assertions or synthesize a rejection for old requests. A crashed producer lock also stops without automatic reclamation. Legacy checkpoint receipts and per-Run adapters are preserved without migration.

Producer handoff completion does not imply automatic GitHub Run support. The installed Run entry still has its own host, package and tracker-reader requirements. A consumer can inspect the producer independently of those requirements.
