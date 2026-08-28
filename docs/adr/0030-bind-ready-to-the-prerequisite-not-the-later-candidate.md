---
status: accepted
---

# Bind READY to the prerequisite, not the later candidate

A `READY` receipt binds the exact Issue, prerequisite commit, artifact paths and SHA-256 hashes, resolver or policy identity, and non-sensitive manual target identity. Later implementation commits do not invalidate it when the prerequisite commit remains an ancestor and every protected value still matches; changing the artifact, resolver or policy, manual target, or required ancestry makes the receipt stale. This avoids re-running manual SQL or full verification merely because `execute-issue` advances the candidate.
