---
status: accepted
---

# Keep prerequisite inspection optional and gated

`pre-execute-issue` remains a user-invoked inspection after a Tracker Spec or child Issue is written; it is not inserted into every delivery route. To keep that optional invocation from becoming a safety gap, `execute-issue` performs read-only prerequisite discovery at Entry: no repository declaration preserves the ordinary route, a valid required receipt permits execution, and missing or stale required evidence stops with an instruction to invoke `pre-execute-issue`; it never invokes the skill or performs the external action automatically.
