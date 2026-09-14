# Documentation-only Seal candidate

Read this reference only when a canonical Single-Issue body declares a **documentation-only Seal candidate**. It defines the sole exception to an ordinary non-empty execution-baseline-to-candidate diff and grants no planning, integration, close, push, deployment, or broader scope authority.

Before selecting the exception, require every condition:

- the execution baseline equals the declared Planning Seal `S`, and that Seal is the read-back Seal for this published Issue;
- `S` has exactly one parent `P`;
- `git diff --name-only P...S` is non-empty and equals the declaration's non-empty exact repository-relative documentation-path list;
- the complete `P...S` diff is documentation only; and
- the declaration says that `S` delivered the complete accepted outcome and excludes runtime, schema, API, deployment, Manual prerequisites, and every other execution change.

Then set candidate `C = S`, use `workflowArtifacts = []`, and give `code-review` the frozen `P...S` range and declaration. Record `reviewBasis.kind: planning_seal_documentation:v1`, `reviewBaseline: P`, `reviewCandidate: S`, and the exact declared paths in completion evidence. Do not create an empty marker commit or reclassify sealed documents as workflow artifacts. If any condition fails, stop: do not infer this mode and do not bypass the ordinary non-empty baseline-to-candidate rule.
