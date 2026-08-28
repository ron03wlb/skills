# GitLab Ron authority local repair

**Goal:** Make the local Ron workflow consume GitLab Issue records without weakening envelope integrity or requiring GitHub-specific tracker wording.
**Why planning is required:** The change affects durable authorization read-back and fail-closed workflow gates across multiple promoted skills.
**Acceptance:** The repair remains local to this checkout, performs no tracker write, push, merge, release, or deployment, preserves unrelated user state, keeps the shared verifier strict, permits only an explicit `tracker_adapter: gitlab` read-back boundary to restore one missing terminal LF, still rejects tampering or extra trailing data, and leaves focused Ron tests green.

### Outcome 1: Provider-trimmed envelopes verify safely
- Work: Add focused coverage proving direct verification still rejects a missing terminal LF, while `envelope-verify` with explicit `tracker_adapter: gitlab` restores only that one byte before strict hash, marker, canonical payload, duplicate-field, and trailing-data verification.
- Verify: `node --test tests/ron-workflow/ron-wiki.test.mjs`

### Outcome 2: Ron tracker contracts are provider-neutral
- Work: Replace GitHub-only gates in `setup-ron`, `to-spec-ron`, and `execute-issue`; use the command-stable `--output json` GitLab CLI guidance; synchronize affected human docs without changing invocation metadata or widening workflow authority.
- Risks/open questions: The full contract file has two pre-existing failures outside this scope; compare the final full run with that baseline and do not claim it green.
- Verify: `node --test --test-name-pattern "existing Ron skills|GitLab tracker guidance" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 3: Final local checkout is reviewable
- Work: Inspect the complete diff, confirm only owned plan, script, tests, skill contracts, tracker template, and synchronized docs changed, and retain all changes locally without commit or push.
- Verify: `git diff --check && git status --short --branch`
