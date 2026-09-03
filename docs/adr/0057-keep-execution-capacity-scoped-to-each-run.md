---
status: accepted
---

# Keep execution capacity scoped to each Run

Each Spec Run keeps its own `max_parallel`, and the workflow adds no repository-wide or machine-wide pool for `execute-issue` capacity. Separate Runs may execute concurrently without shared slot leases or a global scheduler; resource contention remains an Issue-local environment failure handled by the existing bounded diagnosis and retry path. This preserves multi-Spec concurrency and keeps coordination out of the public Skill contracts, while allowing a repository-scoped capacity mechanism to be reconsidered later only from observed resource-exhaustion evidence.
