---
status: accepted
---

# Budget main Skill files by role

Router Skills such as `ask-matt` must keep their main `SKILL.md` at or below 700 words. Operational workflow Skills such as `to-spec`, `to-tickets`, `run-issue-workflow`, `execute-issue`, and `close-issue` must keep their main `SKILL.md` at or below 1,500 words. Branch-specific references are outside that entry-file budget and are loaded only when their exact trigger applies.

Each main Skill keeps only entry authority, the ordered happy path, a completion criterion for each step, hard-gate and recoverable-terminal behavior, and exact pointers to branch-specific references. Legacy compatibility, receipt and payload schemas, tracker adapter interfaces, manual prerequisite details, cleanup and recovery matrices, and completion-note compatibility belong in owner-local references.

Each validation rule has one authoritative owner. Downstream Skills consume the owner's immutable receipt instead of repeating its validation. Contract tests enforce the role budget, required reference pointers, and absence of duplicated contract fragments so progressive disclosure reduces context without weakening fail-closed behavior.
