---
name: push-target
description: Push one receipt-bound local target to its configured upstream and prove the exact remote ref.
disable-model-invocation: true
---

# Push Target

Consume one current local-ahead `push_ready:v1` receipt and deliver only its exact verified target. This is the sole narrow remote-push step after Issue closeout and aggregate target verification. It does not create readiness, repair drift, or treat a successful push as deployment or production verification.

## Freeze the target and receipt

Read repository instructions without changing the checkout. Resolve the argument as one named existing local target branch, its full `refs/heads/<target>` ref, and exact local `HEAD`; never infer the target from the current checkout or switch branches.

Read `refs/notes/matt-push-ready` at that exact `HEAD`. Require exactly one structurally readable `push_ready:v1` record attached to the commit; a body containing multiple plausible records is duplicate evidence, and an older commit's note is never a fallback. Validate its local-ahead mode, exact target, full baseline and verified target SHA, member Issue and candidate identities, reconciliation and Direct target contribution identities, coverage evidence, clean Standards and Spec results, exact passing commands and results, Successor verification evidence, and clean verification-worktree result. Require the receipt's verified target SHA to equal current target `HEAD`.

Missing, duplicate, malformed, stale, mismatched, already-pushed, or ambiguous receipt or target evidence stops before remote mutation. Never rewrite, replace, move, delete, or synthesize the receipt.

## Revalidate the configured upstream after fetch

Resolve the named target's unique configured upstream as one Git remote and one full remote branch ref. A missing remote, missing upstream ref, multiple plausible destinations, local `.` remote, implicit default, or need to guess from `origin`, the current checkout, URLs, or push configuration stops. Freeze the remote name, remote URL identity, remote ref, receipt, local target ref, baseline `B`, and verified target `V`.

Fetch that exact remote immediately before delivery. After fetch, resolve the exact fetched upstream tip and reread the local target, upstream configuration, and receipt. Continue only when the receipt baseline equals the fetched upstream tip, local target `HEAD` equals the receipt target SHA, `B` is an ancestor of `V`, `B..V` is non-empty, and the remote, upstream ref, local ref, receipt, and their object identities have not drifted. Any upstream drift, local-target drift, ref drift, receipt drift, empty range, missing object, or ancestry failure stops before push.

Do not pull, merge, rebase, reset, switch, create, delete, or rewrite a branch while reconciling drift. A stale or already-pushed receipt returns to the human; fresh readiness comes only from a separately invoked `/verify-target-before-push <target>`.

## Push once and read the remote ref back

Perform one ordinary non-force push of the exact verified local target ref to the exact configured upstream ref, using an explicit refspec equivalent to:

```bash
git push <upstream-remote> refs/heads/<target>:<upstream-ref>
```

Never use force, force-with-lease, mirror, all-branches, tag-following, deletion, wildcard, or additional refspecs. Never push Git notes, tags, another branch, or a symbolic default. Issue the push command at most once.

After the command returns, query that exact remote branch ref directly, require exactly one readable remote SHA, and claim success only when it equals the exact receipt target SHA `V`. Reread the local target, upstream configuration, and receipt once more; any rejection, transport failure, remote mismatch, missing or duplicate remote result, local or configuration drift, or post-push ambiguity is unresolved delivery. Report the frozen identities and observed result, but never retry, widen the refspec, repair, pull, merge, rebase, force-push, or automatically reverify.

## Preserve every other boundary

The only authorized external-state change is the one exact configured remote branch ref; the preceding fetch may update only normal remote-tracking refs. This skill never changes product files, commits, branches, worktrees, Issues, labels, completion notes, or verification evidence. It never closes an Issue, edits or consumes the receipt as state, pushes another ref, changes another external environment, or deploys.

It never pulls, merges, rebases, force-pushes, performs a receipt rewrite, starts automatic reverification, or deploys. A successful read-back proves only that remote ref equality for exact `V`; it is not deployment, runtime, or production evidence.
