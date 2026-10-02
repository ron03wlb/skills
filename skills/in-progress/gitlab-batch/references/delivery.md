# Whole-batch delivery

## Independent review

Run `review <root-ref>` from the **target checkout**, outside the execution terminal, only when every member is accepted, tracker progress is synchronized and the batch checkout is clean. Freeze target `T` and candidate `C`; `T` must be an ancestor of `C` and accepted member commits must be reachable. The aggregate gate reruns every distinct per-Issue and batch verification command. Test failures or changes to HEAD/checkout keep delivery blocked.

The script writes a fixed review packet under Git common directory: exact plan/hash, acceptance, binary diff and complete target/candidate file snapshots. Symlinks are stored as link text, not followed. Submodules require explicit materialized evidence; this v1 snapshot refuses to claim coverage of them.

Each reviewer is a **fresh Pi process**, not a continuation of the implementation transcript, with:

```text
--no-extensions --no-skills --no-prompt-templates --no-context-files
--no-session --tools read,grep,find,ls --system-prompt <fixed review instruction> --print <packet request>
```

No shell, edit/write, tracker tools or delegation are exposed. This is a tool restriction, **not an OS sandbox**: installed Pi, its credential/configuration and built-in read tools still operate with the workstation's permissions. Credentials for the selected Pi model must already be available; lack of credentials or an unavailable model produces incomplete review, not approval. Repository files and diff text are untrusted evidence, not instructions to the reviewer.

A small batch gets `whole-batch`; multiple segments get each segment plus `cross-domain`. All shards use the same `T..C`, with independent JSON results:

```json
{"version":1,"target":"<T>","candidate":"<C>","shard":"A","status":"pass","findings":[]}
```

Other valid statuses are `changes_requested` and `incomplete`. Findings require path, positive line and explanation. Pass with findings, invalid JSON, wrong identity, missing shard or insufficient coverage cannot approve integration. Candidate/target is checked again after all reviewers.

For requested changes, preserve findings and arrange explicit owner recovery; a stopped execution model cannot run arbitrary shell to reopen itself. The human can run the owner's regression operation directly in that same worktree below 70%; an exhausted owner needs confirmed fresh-session takeover after verified inactivity. Retract affected acceptance, checkpoint and confirm a fresh session before repairs; repair only in the same batch worktree and reaccept. Moving back to a prior segment requires a checkpoint/new-session confirmation. Rerun aggregate verification and **all** review shards for the changed candidate. A clean old review does not cover a repair commit.

## Local integration and closure

Run `integrate <root-ref>` in the **target checkout**, outside the batch execution terminal. It displays exact `T`, `C`, target branch, plan hash and the ordered member/parent closure list. Obtain explicit human confirmation before passing the preview token. An earlier start or passing review supplies no integration consent.

The script holds a repository-local integration lock plus the batch operation lock. It requires one unique clean local checkout of the target, unchanged HEAD `T`, a clean unchanged batch candidate `C` and complete matching verification/review. It fast-forwards only to `C`, reads HEAD back, then writes **locally integrated, NOT pushed** notes (each member's accepted commit, criterion/command summary, batch candidate and target branch; parent gets all member/commit links), closes each member and finally the parent, and removes the clean worktree via the exact Orca identity. No `--force` cleanup, rebase, push, MR or deployment is performed.

If target advanced: stop without closing or cleaning. Merge that latest target into the original batch worktree, resolve conflicts and regress/reaccept affected behavior, rerun complete verification/review, and obtain a new exact integration confirmation. Never rebase automatically or reinterpret a stale token.

If merge succeeded but the response/save was lost, recovery only accepts HEAD `C` when the same journal already records its merge attempt. If note, close or cleanup fails afterward, re-enter with the same still-matching confirmation to complete only missing steps; do not integrate twice. Target drift during this recovery blocks it. Successful cleanup must be absent from both Orca's complete list and the local filesystem; a dirty/mismatched checkout or unknown cleanup result is retained for recovery.

Completion is `done` only after every step reads back. Report exact local commit, all tracker outcomes, cleanup and **not pushed**. Later remote delivery belongs to a separately authorized action outside this flow.
