---
status: accepted
---

# Consume push readiness through an explicit push-target operation

Remote delivery uses a separate human-invoked `/push-target <target>` operation after `execute-issue`, `close-issue`, and a passing local-ahead `verify-target-before-push`. The operation requires one unique configured upstream, fetches it, and proceeds only while the receipt baseline still equals that upstream tip and the receipt target still equals local target `HEAD`; any drift stops without pull, merge, rebase, force push, or automatic reverification. It then performs only an ordinary non-force push of the exact verified target and reads the remote ref back; execution, closeout, and verification retain their existing non-pushing boundaries, and receipt creation never becomes automatic push authority.
