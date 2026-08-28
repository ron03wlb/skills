---
status: accepted
---

# Use a dedicated one-time prerequisite setup skill

Consumer repositories adopt prerequisite handling through an explicitly invoked `setup-pre-execute-issue` skill. A repository without a concrete manual prerequisite skips setup, declares no resolver, and continues directly through `execute-issue` with the compatible `NOT_REQUIRED` result. When adoption is needed, the setup skill may inspect the repository and atomically add or update only the minimum repository instructions, prerequisite policy, repository-owned resolver implementation, and test fixture needed to expose `discover`, `prepare`, and `verify`; it then performs safe repository-local validation and stops. If the complete contract cannot be validated, setup leaves no active instruction declaration, placeholder resolver, or TODO adoption state and reports the missing evidence. It never executes SQL, mutates a database, changes Issue state or receipts, invokes runtime Issue skills, or acts as a router. Existing repositories do not rerun `ask-matt`, and the retired `ask-ron` pattern is not revived.
