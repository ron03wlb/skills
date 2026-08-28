---
status: accepted
---

# Require one read-only target check for READY

After the human performs the exact prerequisite action, `pre-execute-issue` calls the repository resolver's `verify` operation once against the non-sensitive target identity and only the artifact's declared outcome. A human statement alone cannot grant `READY`; success appends and reads back the receipt once, while failure or unavailable access leaves `WAITING_MANUAL` in force and returns transient `BLOCKED`. Verification never replays SQL, polls, runs the full integration suite, or stores credentials in tracker evidence.
