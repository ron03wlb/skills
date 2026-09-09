import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Structural contract evidence only: these assertions do not run a model.
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8").replace(/\r\n?/gu, "\n");
const skill = read("skills/productivity/grilling/SKILL.md");

test("grilling bounds material questions to the agreed scope", () => {
  assert.match(skill, /unresolved material decisions within the agreed scope/u);
  assert.match(skill, /product behavior, scope, authority, or material risk/u);
  assert.match(skill, /Resolve routine implementation details from source and existing conventions/u);
  assert.match(skill, /Hypothetical branches unrelated to the agreed scope stay outside the tree/u);
  assert.doesNotMatch(skill, /every branch of the design tree visited/u);
});

test("grilling preserves accepted decisions unless identified evidence invalidates them", () => {
  assert.match(skill, /Carry accepted decisions forward on continuation and re-entry/u);
  assert.match(skill, /Reopen a decision only when new evidence invalidates its basis/u);
  assert.match(skill, /identify that evidence and the affected decision/u);
  assert.match(skill, /Existing approvals apply only to their settled scope/u);
});

test("grilling retains dependency rounds and waits for unresolved material prerequisites", () => {
  assert.match(skill, /prerequisites are already settled/u);
  assert.match(skill, /belongs to a _later_ round/u);
  assert.match(skill, /running exploration is an unsettled prerequisite/u);
  assert.match(skill, /no unresolved material decisions remain, including those waiting on prerequisites/u);
});

test("grilling preserves final confirmation, caller limits, permissions and prerequisites", () => {
  assert.match(skill, /Do not act on it until the user confirms you have reached a shared understanding/u);
  assert.match(skill, /Silence is not agreement or approval/u);
  assert.match(skill, /one material decision at a time, restrict the round to that decision/u);
  assert.match(read("skills/engineering/grill-with-docs/SKILL.md"), /Work one material decision at a time/u);
  assert.match(skill, /actual operation permissions and declared Manual prerequisites/u);
  assert.match(skill, /Follow \[Run preparation\]\(\.\.\/\.\.\/\.\.\/docs\/agents\/run-preparation\.md\)/u);
  assert.match(skill, /Reuse settled approvals in later leaves and re-entry/u);
});

test("grilling discovery and human guidance describe the same bounded interview", () => {
  const docs = read("docs/productivity/grilling.md");
  assert.match(docs, /unresolved material decisions within the agreed scope/u);
  assert.match(docs, /new evidence invalidates/u);
  assert.match(docs, /Silence is not agreement or approval/u);
  assert.match(read("skills/productivity/grilling/agents/openai.yaml"), /unresolved material decisions/u);
  for (const path of ["README.md", "skills/productivity/README.md"]) {
    const entry = read(path).split("\n").find((line) => line.includes("**[grilling]"));
    assert.match(entry, /unresolved material decisions/u);
    assert.doesNotMatch(entry, /every branch/u);
  }
  assert.match(read("skills/engineering/ask-matt/SKILL.md"), /`\/grilling` pressure-tests unresolved material decisions within the agreed scope/u);
});
