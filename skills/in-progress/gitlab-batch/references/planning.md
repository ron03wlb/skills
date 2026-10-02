# Planning and publication

## Draft one BatchPlan

1. Inspect relevant code, tests, instructions and the target branch. Ask only for unresolved scope, target, manual work or costly decisions. For an SSH origin, obtain the explicit GitLab HTTP(S) origin; do not guess its scheme or project ID.
2. Use `doctor --input <binding.json>` with `{ "origin": "https://your-gitlab", "projectPath": "group/project", "projectId": 123 }`. The numeric ID must come from a read-only GitLab project lookup (`glab api projects/<URL-encoded-path> --hostname <host>`); doctor independently reads it back and checks origin. No credentials are written into the binding or draft.
3. Decompose by complete, observable behavior, not controller/service/DAO layers. A small single Issue has no parent. A multi-Issue plan publishes one ordinary parent listing its members, without paid hierarchy features.
4. Group ordered Issues into bounded sessions: one main domain, at most three Issues by default, including exploration, implementation, tests and repair costs. Split oversized behaviors; three large Issues are not a budget. Every Issue belongs to exactly one segment. Dependencies precede their consumers both within and across segments.
5. Save the complete structured draft through the script. Inspect its returned publish preview. Planning ends here; it creates neither remote Issues nor worktrees.

Minimal schema example (replace values and executable with the actual verified repository commands):

```json
{
  "version": 1,
  "id": "payment-validation",
  "revision": 1,
  "origin": "https://your-gitlab",
  "projectPath": "group/project",
  "projectId": 123,
  "title": "Validate payment input",
  "targetBranch": "main",
  "issues": [{
    "key": "validation",
    "title": "Reject invalid payment parameters",
    "goal": "Invalid input cannot reach submission",
    "scope": "Validate required fields and return documented errors",
    "exclusions": "No payment provider or deployment changes",
    "criteria": ["Invalid required fields return the documented error"],
    "dependsOn": [],
    "external": [],
    "prerequisites": [],
    "verify": [{"file": "npm", "args": ["test"], "timeoutMs": 300000}]
  }],
  "segments": [{
    "id": "A",
    "domain": "payment",
    "issues": ["validation"],
    "effort": "Small: inspect validation, implement behavior, test and repair",
    "verificationCost": "Full test suite, about two minutes",
    "handoffCondition": "Acceptance recorded, then checkpoint and stop"
  }],
  "verify": [{"file": "npm", "args": ["test"], "timeoutMs": 300000}]
}
```

`maxIssuesPerSegment` can explicitly change the default. Segment IDs `whole-batch` and `cross-domain` are reserved for review. Use stable Issue keys on revision. Each `external` entry is `{url, commit}`: a closed Issue in this GitLab project plus its full Git commit already in the target baseline. Each manual prerequisite is `{id, description}`. This v1 project adapter does not infer cross-project dependency authorization.

Verification uses `{file,args,timeoutMs?}` arrays, with the worktree as cwd. They are confirmed executable commands, not evidence-supplied shell strings. Prefer direct test executables or existing package scripts; review any command capable of external mutation before including it. Aggregate verification is mandatory even when it repeats per-Issue tests.

## Publish

Run `publish <draft-id>` without a token. Show its entire plan and operation token to the human; after confirmation run the same operation with `--confirm <token>`. A stale token fails.

A single Issue is its own root and publishes the complete confirmed BatchPlan, including target branch, work segments and aggregate commands; no parent is created. A multi-Issue parent publishes the same complete plan, revision and SHA256 semantics; children carry their specifications, shared target branch, segment and parent link.

The script checks the complete dependency/segment mapping, publishes members and parent using durable operation markers, and reads exact titles and descriptions back. Only complete publication becomes `ready`. Partial publication retains the same draft and markers. Re-enter the same operation; do not create a replacement batch to conceal an uncertain result.

An attempted create without a read-back marker is **uncertain**, not a failed create known to be safe to repeat. Investigate the exact GitLab operation and reconcile its journal with the human before retry. Matching markers recover successful-but-lost responses; duplicate markers block. Never delete an attempted journal entry merely to get past the guard.

## Confirmed revision

Scope changes, adding/removing Issues, regrouping segments, changing target or upgrading an old published description format require a human-confirmed revised BatchPlan. Running batches are never silently republished in the new format. Checkpoint first, with no active Issue, and synchronize every original pending record before revision. `revise <batch-id> --input <next-plan.json>` previews old plan hash, new plan and exact next target. Confirm it, then publish the returned revision preview separately.

The ID/project remain fixed; revision increments by one. The same worktree and branch survive. All acceptance/review is invalidated for revalidation, and ownership is released for explicit resume. A changed target must already be an ancestor of the batch checkout: if not, the confirmed revision preparation records the exact target and stops for a manual merge there. Resolve/verify without automatic rebase, then retry the same revision. No revised tracker specification is published before this succeeds.

Single-to-multi publication adds the parent while retaining matching member IIDs. Removed members or a retired parent receive a revision note and remain for human disposition; they are neither secretly executed nor automatically closed by the revised batch. The current root command is returned after publication.
