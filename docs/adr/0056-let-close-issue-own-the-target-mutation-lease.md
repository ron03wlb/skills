---
status: accepted
---

# Let close-issue own the target mutation lease

`close-issue` is the sole owner that acquires, holds, and releases the target-scoped Target mutation writer for both direct-human and DAG-coordinated closeout. A coordinator may observe contention, wait within its bound, and revalidate authority before requesting closeout, but it never pre-acquires or delegates the lease; the leaf must safely stop if another writer wins the race. This keeps same-target closeout serialized while different targets, repositories, and Issue execution remain concurrent, and avoids both non-reentrant double acquisition and a larger lease-delegation contract.
