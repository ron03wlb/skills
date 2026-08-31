---
name: daily-journal
description: Run a voice-first daily reflection when the user asks to record the day, then polish the entry in English and finish with a short English practice.
---

# Daily Journal

Guide a short spoken reflection. Keep the user's meaning and voice; write the finished diary in natural English.

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

## English practice

After the completed entry, select one to three of the user's English sentences that offer the most useful improvement. For each, show the original sentence, a natural revision, and one short reason. Prioritize recurring grammar patterns and expressions the user is likely to reuse. If no correction is worthwhile, say so briefly.

## Saving to Heptabase

Use the local Heptabase CLI only after the user asks to save, record, edit, or update the journal. Read the current journal first, preserve its unrelated content, and use conflict detection when saving.

When a reusable **Daily Journal Template** exists, apply its three-section structure to the current day's journal. Preserve unrelated journals, notes, and boards.
