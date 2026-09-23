# Legacy execution operation identity

Read this reference only when a historical `implementation_complete` omits `operationIdentity`, or when the first prospective repository-backed completion in its exact repository, tracker, Spec, and Issue-target scope needs the adoption frontier. It solely owns field-less completion compatibility.

Before that first prospective completion, append or reuse one logical `workflow_operation_identity_contract_adopted:v1` record in the parent or linked Spec. Its frozen `legacyCompletionFrontier` lists every already valid field-less completion by exact Issue, immutable tracker evidence identity or durable local locator, and SHA-256 of its exact body. Payload-identical physical records collapse; malformed, conflicting, duplicate-entry, unreadable, mismatched, or digest-mismatched evidence stops.

After adoption, only an exact frontier member may omit `operationIdentity`; a genuinely unadopted scope retains its original legacy contract. A current `tracker_only:v1` completion carries the full identity in its sole authorized note, follows its shared contract, and writes no adoption record. The record grants no implementation, review, close, verification, push, or deployment authority.

Never migrate, overwrite, delete, recreate, or synthesize old execution evidence. An existing valid completion or active legacy lane keeps its recorded identity; missing, duplicate, mismatched, stale, out-of-order, or ambiguous evidence stops before implementation or tracker mutation.
