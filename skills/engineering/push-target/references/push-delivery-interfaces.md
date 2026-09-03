# Push delivery interfaces

Use these owner-local interfaces for the one receipt-bound remote delivery. They do not create or refresh verification evidence.

## Receipt input

Resolve the argument as one named existing local target branch, its full `refs/heads/<target>` ref, and exact local `HEAD`. Read `refs/notes/matt-push-ready` at that exact `HEAD`. Require exactly one structurally readable `push_ready:v1` record attached to the commit; a body containing multiple plausible records is duplicate evidence, and an older commit's note is never a fallback.

Validate local-ahead mode, exact target, full baseline and verified target SHA, member Issue and candidate identities, reconciliation and Direct target contribution identities, coverage evidence, clean Standards and Spec results, exact passing commands and results, Successor verification evidence, and clean verification-worktree result. Require the receipt's verified target SHA to equal current target `HEAD`.

## Frozen destination

Resolve the named target's unique configured upstream as one Git remote and one full remote branch ref. Resolve exactly one fetch URL and one push URL and require them to be the same resolved URL, proving one single endpoint for baseline validation, delivery, and read-back. A split fetch/push endpoint, missing remote, missing upstream ref, multiple plausible destinations, local `.` remote, implicit default, or need to guess from `origin`, the current checkout, URLs, or push configuration stops. Freeze the remote name, identical fetch and push URL, remote ref, receipt, local target ref, baseline `B`, and verified target `V`.

Fetch immediately before delivery with `git fetch --no-tags <frozen-fetch-url> <upstream-ref>:<remote-tracking-ref>`. The frozen URL and explicit refspec prevent remote-name configuration or automatic tag following from widening the fetch beyond the exact upstream branch and its normal remote-tracking ref. After fetch, resolve the exact fetched upstream tip and reread the local target, upstream configuration, and receipt. Continue only when the receipt baseline equals the fetched upstream tip, local target `HEAD` equals the receipt target SHA, `B` is an ancestor of `V`, `B..V` is non-empty, and the remote, URLs, upstream ref, local ref, receipt, and their object identities have not drifted. Any upstream drift, local-target drift, ref drift, receipt drift, empty range, missing object, or ancestry failure stops before push.

The fetch uses `--no-tags` for the exact upstream ref and its one normal remote-tracking ref.

## One delivery and read-back

Use the frozen push URL rather than the remote alias so remote-scoped mirror or additional-push configuration cannot widen the operation; `--no-follow-tags` neutralizes repository or user `push.followTags` configuration. Never use force, force-with-lease, mirror, all-branches, tag-following, deletion, wildcard, or additional refspecs. Never push Git notes, tags, another branch, or a symbolic default.

After the command returns, query the exact remote branch ref from that same frozen push URL, require exactly one readable remote SHA, and claim success only when it equals the exact receipt target SHA `V`. Reread the local target, upstream configuration, and receipt once more; any rejection, transport failure, remote mismatch, missing or duplicate remote result, local or configuration drift, or post-push ambiguity is unresolved delivery. Report the frozen identities and observed result, but never retry, widen the refspec, repair, pull, merge, rebase, force-push, or automatically reverify.

Read the exact remote ref, compare it with the exact receipt target SHA, and report success only on equality.

The operation changes no Issue, completion note, Git note, tag, other branch, other worktree, product file, deployment, or production environment.
