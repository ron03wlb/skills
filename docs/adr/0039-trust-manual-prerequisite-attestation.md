---
status: accepted
---

# Trust manual prerequisite attestation

`pre-execute-issue` accepts one human statement naming the exact repository artifact already executed for an Issue, appends and reads back one `manual_prerequisite_complete:v1` tracker note, and stops. `execute-issue` consumes that Issue-and-path attestation without resolver adoption, artifact preparation, an artifact-only commit, target identity, DB access, `WAITING_MANUAL`, `READY`, or a second invocation. The attestation authorizes workflow continuation but deliberately does not claim to prove the external target outcome. This simpler authority boundary supersedes ADR-0024 through ADR-0035 and removes `setup-pre-execute-issue` from the public workflow.
