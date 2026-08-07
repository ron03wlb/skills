Quickstart:

```bash
npx skills add mattpocock/skills --skill=wiki
```

```bash
npx skills update wiki
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/wiki)

## What it does

`wiki` independently inspects or updates one repository Wiki. It resolves an explicit, unique existing, or default `wiki/` root; validates page structure, Sources, links, and the docs build; compares edits with committed source/tests; repairs confirmed findings up to ten waves; and creates one Wiki-only local commit.

## When to reach for it

You invoke this by typing `/wiki` — the agent won't reach for it on its own. Add `status` for a read-only report; invoke it without `status` when you want a Wiki-only local edit and commit.

## Safety boundary

Existing Wiki dirt, related uncommitted source/tests, or ambiguous roots stop. Unrelated dirty files remain untouched, and only Wiki paths are staged. The flow does not create tracker work, edit product code, push, deploy, or publish.

## Where it fits

This is a standalone documentation skill routed from [ask-matt](https://aihero.dev/skills-ask-matt). It is not part of Issue execution or closeout.
