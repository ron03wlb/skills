# Issue tracker: GitHub

Issues and PRDs for this repository live in GitHub Issues at `ron03wlb/skills`. Use the `gh` CLI with `--repo ron03wlb/skills` for tracker and label operations so the `upstream` remote is never selected accidentally.

## Conventions

- **Create an issue**: `gh issue create --repo ron03wlb/skills --title "..." --body "..."`
- **Read an issue**: `gh issue view <number> --repo ron03wlb/skills --comments --json number,title,body,state,labels,comments,url`
- **List issues**: `gh issue list --repo ron03wlb/skills --state open --json number,title,body,labels,comments`
- **Comment on an issue**: `gh issue comment <number> --repo ron03wlb/skills --body "..."`
- **Apply or remove labels**: `gh issue edit <number> --repo ron03wlb/skills --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --repo ron03wlb/skills --comment "..."`

## Pull requests as a triage surface

**PRs as a request surface: no.** Set this to `yes` only if the repository later treats external PRs as feature requests.

When enabled, resolve a bare `#<number>` as a PR first and fall back to an Issue. Discovery includes only external authors whose association is `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE`; it excludes `OWNER`, `MEMBER`, and `COLLABORATOR`.

## Skill operations

- When a skill says **publish to the issue tracker**, create a GitHub Issue in `ron03wlb/skills`.
- When a skill says **fetch the relevant ticket**, read the Issue body, labels, and comments from `ron03wlb/skills`.
- Read every tracker mutation back once before claiming success.

## Wayfinding operations

Used by `/wayfinder`. The map is one Issue with child Issues as decision tickets.

- **Map**: one Issue labelled `wayfinder:map` that owns Notes, Decisions-so-far, and Fog.
- **Child ticket**: prefer GitHub sub-issues. If unavailable, put the child in the map task list and add `Part of #<map>` to the child body.
- **Blocking**: prefer GitHub native issue dependencies. If unavailable, use `Blocked by: #<n>` in the child body.
- **Frontier**: open, unblocked, unassigned children in map order.
- **Claim**: assign the child to the driving developer; this is the session's first tracker mutation.
- **Resolve**: comment with the decision, close the child, then append a context pointer to the map.
