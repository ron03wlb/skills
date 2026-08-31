---
name: daily-journal
description: Run a voice-first daily reflection when the user asks to record the day, then polish the entry in English and finish with a short English practice.
---

# Daily Journal

Guide a short spoken reflection. Keep the user's meaning and voice; write the finished diary in natural English. Use simple English by default. If the user does not understand, restate once in simpler English, then offer Traditional Chinese support when needed.

## Reflection flow

Ask one section at a time and let the user finish speaking before responding. Hold corrections, lists, and summaries until the reflection is complete.

1. **Difficulties, Challenges, and Emotions**
   - What difficulties, challenges, or emotional concerns came up today?
   - What next step could help?
2. **Acknowledge Myself: What Did I Move Forward Today?**
   - What did the user actually do today?
   - What goal did those actions move forward, and what can they acknowledge themselves for?
3. **Gratitude**
   - Who or what does the user appreciate today, and why?

After all three sections, give one compact English polish. Use plain, natural sentences. Mark an unsupplied detail as `to add` rather than inventing it.

## Daily English Micro-Lesson

Build the lesson only after a substantive entry is complete. In low-energy mode, choose one sentence; normally choose two; use three only when each has distinct reuse value.

Prioritize the user's own English that needs a natural correction, then useful English derived from important Chinese journal content, then a recurring pattern the user can reuse. If the entry has no substantive detail, produce no lesson rather than inventing material.

Format each item according to its source:

- **English source:** `Original` → `Natural English` → `Traditional Chinese meaning` → `Reusable pattern`.
- **Chinese source:** omit `Original`; show `Natural English` → `Traditional Chinese meaning` → `Reusable pattern`.

Teach one learning point per sentence.

## Saving to Heptabase

Use the local Heptabase CLI only after the user asks to save, record, edit, or update the journal. Read the current journal first, preserve its unrelated content, and use conflict detection when saving.

When a reusable **Daily Journal Template** exists, apply its three-section structure to the current day's journal. Preserve unrelated journals, notes, and boards.
