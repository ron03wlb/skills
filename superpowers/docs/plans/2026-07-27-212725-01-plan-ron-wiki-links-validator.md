# Ron Wiki deterministic link validation

**Goal:** Add one dependency-free, read-only `links-validate` command to the shared Ron Wiki core so `setup-ron` can persist and probe a truthful links/navigation validator.
**Why planning is required:** This repairs a shared workflow contract used across repositories and is a prerequisite for a later local setup commit in another repository.
**Acceptance:** The public CLI deterministically validates repository-local Markdown links under one declared Wiki root; clean links pass, missing or escaping targets fail closed, external URLs are ignored, fragments resolve against headings, validation leaves Git state unchanged, existing commands remain compatible, and no tracker, network, push, release, installation, or target-repository mutation occurs during this repair.

### Outcome 1: Public failing link-validation seam
- Work: Add focused unit and CLI-forward tests for clean relative links, missing targets, root escape, external URLs, heading fragments, stable exit codes, and unchanged temporary-repository state.
- Verify: `node --test tests/ron-workflow/ron-wiki.test.mjs tests/ron-workflow/ron-wiki-forward.test.mjs`

### Outcome 2: Minimal deterministic implementation
- Work: Add the smallest shared-core function and `links-validate` CLI route. Restrict traversal to sorted `.md` and `.mdx` files under one normalized repository-relative Wiki root; perform no writes and fail closed on unsupported or ambiguous local destinations.
- Verify: `node --check scripts/ron-workflow/ron-wiki.mjs`

### Outcome 3: Shared-contract regression proof
- Work: Run the full Ron workflow tests, skill contract checks, syntax check, and final diff review. Keep the change limited to the core, relevant tests, and this plan.
- Verify: `node --test tests/ron-workflow/*.test.mjs`, `node --test tests/ron-workflow/skill-contracts.test.mjs`, `node --check scripts/ron-workflow/ron-wiki.mjs`, and `git diff --check`
