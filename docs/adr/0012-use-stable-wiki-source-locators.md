---
status: accepted
---

# Use stable Wiki source locators

Each Wiki source entry identifies repository evidence with this structured contract:

- required `path`: a normalized repository-relative file path that cannot escape the repository;
- required `kind`: `symbol`, `test`, `config-key`, `json-pointer`, or `heading`;
- required `value`: the non-empty stable within-file identifier interpreted by the matching deterministic resolver;
- optional `line_hint`: a positive line number used only as a reading hint.

Each topic page serializes these entries as exactly one JSON object in the `Sources` section:

```json
{
  "schema": "wiki-sources:v1",
  "sources": [
    {
      "id": "S1",
      "path": "src/example.ts",
      "kind": "symbol",
      "value": "Example.run",
      "line_hint": 42
    }
  ]
}
```

Source IDs are unique within the page and material claims reference them as `[S1]`. JSON keeps validation deterministic without requiring a project-specific Markdown or YAML parser.

Validation proves that `path` exists in committed repository state and that the matching adapter resolves `kind` plus `value`. Missing, unsupported, or ambiguous resolution never passes Wiki validation.

The bundled Wiki validator supports Markdown/MDX headings, strict-JSON pointers, exact JSON/YAML/TOML/`.env` config-key paths, and declaration-aware Python/JavaScript/TypeScript symbol and test names. It proves one syntactic target, not that the claim is semantically correct. Call sites, comments, string mentions, dynamic config keys, and `line_hint`-only matches do not resolve.

Other languages and formats remain unsupported until the independent Wiki validator explicitly adds a deterministic resolver. Missing capability or zero/multiple targets never passes.

`line_hint` cannot replace `kind` and `value` because line numbers drift during unrelated edits. Individual citations do not duplicate a commit SHA because Wiki mutation preflight binds repository evidence to committed `HEAD`.

External references may supplement but cannot replace repository evidence for implementation claims.
