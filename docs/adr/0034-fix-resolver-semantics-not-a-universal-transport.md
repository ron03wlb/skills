---
status: accepted
---

# Fix resolver semantics, not a universal transport

Generic skills require repository instructions to name an exact executable resolver command, its `discover`, `prepare`, and `verify` invocations, and machine-readable results carrying the required status and protected prerequisite evidence. The repository owns the concrete transport, field names, and extensions; generic skills fail closed on missing, ambiguous, unparseable, or inconsistent required semantics. This avoids a bundled resolver, universal configuration file, or schema engine while retaining enforceable handoff evidence.
