## What it does

`publish-decision` publishes one settled ADR or glossary decision to Git and the Tracker, then stops. It keeps a decision small: the route records documentation and its tracker publication, but never turns that record into implementation work.

Its defining constraint is terminality. A successful publication cannot create a Run, an execution lane, or a `ready-for-agent` label.

## When to reach for it

You invoke this by typing `/publish-decision`, and the agent won't reach for it on its own.

Reach for it when the entire desired outcome is a documented decision with a Tracker record. For a decision that also specifies product behavior or implementation, use [grill-with-docs](https://aihero.dev/skills-grill-with-docs) followed by [to-spec](https://aihero.dev/skills-to-spec).

## Prerequisites

The decision must already be settled, with its target, affected document paths, and tracker publication scope known. [setup-matt-pocock-skills](https://aihero.dev/skills-setup-matt-pocock-skills) must have configured the repository tracker.

## One terminal record

The route creates a durable operation envelope before a write. It keeps the exact published body and its digest together, so a retry can read the same decision rather than reconstructing it from conversation history.

## It's working if

- The ADR or glossary edit and the Tracker body both read back exactly.
- The Tracker Issue retains its existing labels and does not enter an execution queue.
- The final status is `COMPLETED`, without a Run or implementation command.

## Where it fits

This is a terminal branch beside the delivery chain: use it for documentation-only outcomes; use [to-spec](https://aihero.dev/skills-to-spec) for work that must continue to decomposition or delivery. See [ask-matt](https://aihero.dev/skills-ask-matt) for the full route map.
