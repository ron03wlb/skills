# Orders

## Purpose and scope

Describe the current order creation and cancellation flow.

## Current behavior

An order is created in the pending state. [S1]

## Rules and invariants

Only pending orders can be cancelled. [S2]

## States and exceptions

Fulfilled orders reject cancellation. [S2]

## Dependencies

Order behavior is enforced by the order module and its public tests. [S1] [S2]

## Sources

```json
{
  "schema": "wiki-sources:v1",
  "sources": [
    {
      "id": "S1",
      "path": "src/orders.ts",
      "kind": "symbol",
      "value": "createOrder",
      "line_hint": 1
    },
    {
      "id": "S2",
      "path": "src/orders.test.ts",
      "kind": "test",
      "value": "rejects fulfilled cancellation",
      "line_hint": 1
    }
  ]
}
```
