---
status: accepted
---

# Use one prerequisite resolver with three operations

Each repository declares one prerequisite resolver command with `discover`, `prepare`, and `verify` operations. Both `pre-execute-issue` and `execute-issue` consume the same read-only `discover`, so prerequisite rules have one implementation; `execute-issue` may call nothing else. User-invoked `pre-execute-issue` may call bounded artifact-writing `prepare`, repair repository-reported syntax or static failures until the artifact passes, pause for the human external action, and later call read-only `verify` without giving generic skills consumer-specific SQL or environment knowledge.
