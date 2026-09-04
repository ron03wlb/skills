# Issue tracker: GitLab

Issues and PRDs for this repo live as GitLab issues. Use the [`glab`](https://gitlab.com/gitlab-org/cli) CLI for all operations.

Blocking representation: body

## Conventions

- **Create an issue**: `glab issue create --title "..." --description "..."`. Use a heredoc for multi-line descriptions. Pass `--description -` to open an editor.
- **Read an issue**: Use `glab issue view <number> --comments --output json` for machine-readable output.
- **List issues**: `glab issue list --output json` with appropriate `--label` filters.
- **Comment on an issue**: `glab issue note <number> --message "..."`. GitLab calls comments "notes".
- **Read a note by stable ID**: `glab api projects/:id/issues/:iid/notes/:note_id`.
- **Apply / remove labels**: `glab issue update <number> --label "..."` / `--unlabel "..."`. Multiple labels can be comma-separated or by repeating the flag.
- **Close**: `glab issue close <number>`. `glab issue close` does not accept a closing comment, so post the explanation first with `glab issue note <number> --message "..."`, then close.
- **Merge requests**: GitLab calls PRs "merge requests". Use `glab mr create`, `glab mr view`, `glab mr note`, etc. — the same shape as `gh pr ...` with `mr` in place of `pr` and `note`/`--message` in place of `comment`/`--body`.

Infer the repo from `git remote -v` — `glab` does this automatically when run inside a clone.

## `to-tickets` blocker representation

New GitLab tracker configuration declares `Blocking representation: body` without a setup question or mutation probe. It makes the canonical child `## Blocked by` body section the blocker representation for `to-tickets`; a manually proven native implementation may explicitly declare `native` instead. An existing GitLab configuration without this field is `UNKNOWN`: stop before child, relation, label, or parent-record mutation and request one explicit `body` or `native` repair.

Discovery never tests native capability by creating a relation. A generic HTTP 400 never changes the configured representation; declared-native relation write or read-back failure remains a Recoverable blocker. This `to-tickets` setting does not alter parent/sub-issue handling or the separate `/wayfinder` conventions below.

## Merge requests as a triage surface

**MRs as a request surface: no.** _(Set to `yes` if this repo treats external merge requests as feature requests; `/triage` reads this flag.)_

When set to `yes`, MRs run through the same labels and states as issues, using the `glab mr` equivalents:

- **Read an MR**: `glab mr view <number> --comments` and `glab mr diff <number>` for the diff.
- **List external MRs for triage**: `glab mr list --output json`, then keep only MRs whose author is not a project member/owner (a contributor's MR, not a maintainer's in-flight work).
- **Comment / label / close**: `glab mr note`, `glab mr update --label`/`--unlabel`, `glab mr close`.

Unlike GitHub, GitLab numbers issues and MRs separately, so `#42` is unambiguous once you know which surface the maintainer means.

## When a skill says "publish to the issue tracker"

Create a GitLab issue.

## When a skill says "fetch the relevant ticket"

Run `glab issue view <number> --comments`.

## Setup diagnostics

`setup-matt-pocock-skills` may use one project-scoped, read-only `glab issue view --output json` or `glab issue list --output json` call to confirm that this configured tracker is reachable. When `triage` is installed, also run `glab label list --output json`, compare exact names with every configured label in `docs/agents/triage-labels.md`, and report a missing label as `MISSING` without creating it. The result is diagnostic only: it never authorizes publication, execution, integration, aggregate verification, or push, and it must not create or edit an Issue, label, or note.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `glab issue create --label wayfinder:map`. (On GitLab tiers with native epics, an epic may hold the map instead; a labelled issue works everywhere.)
- **Child ticket**: an issue carrying `Part of #<map>` at the top of its description and labels `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitLab's **native blocking link** — the canonical, UI-visible representation. Add it with the `/blocked_by #<n>` quick action, posted as a note (`glab issue note <child> --message "/blocked_by #<blocker>"`). Native blocking links are a Premium/Ultimate feature; on the free tier (or where unavailable) fall back to a `Blocked by: #<n>, #<n>` line at the top of the description. A ticket is unblocked when every blocker is closed.
- **Frontier query**: `glab issue list --output json` scoped to the map's children, drop any with an open blocker — a native `blocked_by` link to an open issue (`glab api projects/:id/issues/:iid/links`), or an open issue in the `Blocked by` line — or an assignee; first in map order wins.
- **Claim**: `glab issue update <n> --assignee @me` — the session's first write.
- **Resolve**: `glab issue note <n> --message "<answer>"`, then `glab issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
