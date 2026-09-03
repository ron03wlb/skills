---
status: accepted
---

# Isolate one Spec workflow lane

Each concurrently planned delivery uses one **Spec workflow lane** bound to exactly one proposed Tracker Spec and target: one Codex task owns one isolated planning worktree, and the published Spec later owns one **DAG Run**. Multiple lanes may grill, publish, and execute against the same target without a global multi-Spec coordinator or shared planning checkout. Issue execution remains concurrent inside each Run and across Runs; only actual Planning Seal and integration writes use the shared target writer.

Target movement does not invalidate an active grilling session. Before publication or a Planning Seal write, **Planning baseline revalidation** reads the latest relevant glossary, ADR, and source facts. A semantically compatible delta may bind the latest baseline; relevant drift stops only that lane for renewed human confirmation. It never silently merges a changed decision or freezes unrelated target work.

A healthy competing target writer places the losing lane in bounded **Target writer wait** rather than failing the workflow. The lane may continue independent Issue execution, and after release it reacquires target, tracker, candidate, and completion evidence before retrying closeout. Unknown ownership, timeout, coordinator loss, or merge conflict still stops without stealing a lease or guessing state.

Final verification remains range-based. One explicit `verify-target-before-push` freezes the integrated local-ahead range; open candidates that are not reachable from that target remain outside the batch, while every reachable member must be closed, covered, reviewed, and verified. Later integration invalidates the receipt, and only a separate human invocation of `push-target` may deliver the exact verified target. We chose this per-Spec topology over a global coordinator or delivery manifest so concurrency does not introduce another scheduler or human-owned batch artifact.
