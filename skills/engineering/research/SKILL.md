---
name: research
description: Compare primary sources to resolve a research question and preserve cited findings in a repository note. Use when source synthesis and a durable note are needed, not a quick fact lookup.
---

Use one **background agent** when the research can proceed independently alongside useful local work. Otherwise perform the bounded research directly. Keep one owner for the cited Markdown artifact; no nested delegation.

Its job:

1. Investigate the question against **primary sources** (official docs, source code, specs, first-party APIs), not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save it where the repo already keeps such notes; match the existing convention, and if there is none, put it somewhere sensible and say where.

If a primary-source page is blocked by a paywall, WAF, or bot check, use the fallback ladder in `blocked-page-recovery/GUIDE.md`; its bundled script is `blocked-page-recovery/scripts/recover_page.py`.
