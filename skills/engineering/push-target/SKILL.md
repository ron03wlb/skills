---
name: push-target
description: Push one receipt-bound local target to its configured upstream and prove the exact remote ref.
disable-model-invocation: true
---

# Push Target

Consume one current local-ahead `push_ready:v1` receipt and deliver only its exact verified target. This is the sole narrow remote-push step after Issue closeout and aggregate target verification. It does not create readiness, repair drift, or treat a successful push as deployment or production verification.

Before reading the receipt or resolving a remote, read [`references/push-delivery-interfaces.md`](references/push-delivery-interfaces.md). Keep receipt fields, destination normalization, and remote read-back payload detail behind that owner-local interface while this public skill retains the explicit human authority, drift gate, one-push boundary, and result.

## Freeze the target and receipt

Read repository instructions without changing the checkout. Resolve the argument as one named existing local target branch and exact local `HEAD`; never infer the target from the current checkout or switch branches. Read exactly one current receipt through the owner-local interface and require its verified target to equal that `HEAD`.

Missing, duplicate, malformed, stale, mismatched, already-pushed, or ambiguous receipt or target evidence stops before remote mutation. Never rewrite, replace, move, delete, or synthesize the receipt.

## Revalidate the configured upstream after fetch

Resolve the named target's unique configured upstream and freeze one destination through the owner-local interface. Fetch that exact branch without tags immediately before delivery, then re-read the receipt, local target, upstream, baseline ancestry, and non-empty range. Any endpoint, upstream, ref, receipt, target, object, or ancestry drift stops before push.

Do not pull, merge, rebase, reset, switch, create, delete, or rewrite a branch while reconciling drift. A stale or already-pushed receipt returns to the human; fresh readiness comes only from a separately invoked `/verify-target-before-push <target>`.

## Push once and read the remote ref back

Perform one ordinary non-force push of the exact verified local target ref to the exact configured upstream ref, using an explicit refspec equivalent to:

```bash
git push --no-follow-tags <frozen-push-url> refs/heads/<target>:<upstream-ref>
```

Issue that command at most once. After it returns, use the owner-local read-back interface and claim success only for exact remote-ref equality with the receipt target. Any rejection, transport failure, mismatch, missing or duplicate result, or later local/configuration drift is unresolved delivery: report it without retry, widening, repair, or automatic reverification.

## Preserve every other boundary

The only authorized external-state change is the one exact configured remote branch ref; the preceding fetch may update only the exact normal remote-tracking ref and fetch metadata, never tags. This skill never changes product files, commits, branches, worktrees, Issues, labels, completion notes, or verification evidence. It never closes an Issue, edits or consumes the receipt as state, pushes another ref, changes another external environment, or deploys.

It never pulls, merges, rebases, force-pushes, performs a receipt rewrite, starts automatic reverification, or deploys. A successful read-back proves only that remote ref equality for exact `V`; it is not deployment, runtime, or production evidence.
