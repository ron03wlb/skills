# Push delivery interfaces

Use these owner-local interfaces for the one receipt-bound remote delivery. They do not create or refresh verification evidence.

## Receipt input

Read exactly one `push_ready:v1` note from `refs/notes/matt-push-ready` at the named local target `HEAD`. Require local-ahead mode and exact target, baseline, verified SHA, members, coverage, Standards, Spec, commands, results, successor dispositions, Direct target contribution and reconciliation identities, and clean verification-worktree evidence.

## Frozen destination

Resolve one local branch ref, one configured upstream remote branch ref, and one fetch URL plus one push URL that resolve to the same endpoint. Fetch only that branch with no tags, then re-read the receipt, local target, upstream configuration, fetched baseline, ancestry, and non-empty range. Any drift stops before push.

## One delivery and read-back

Push once with an explicit non-force, no-follow-tags local-ref-to-upstream-ref refspec against the frozen URL. Query only that exact remote branch afterward and require its SHA to equal the receipt's verified target. A rejection, mismatch, missing result, duplicate result, or later local/configuration drift remains unresolved delivery and is never retried automatically.

The operation changes no Issue, completion note, Git note, tag, other branch, other worktree, product file, deployment, or production environment.
