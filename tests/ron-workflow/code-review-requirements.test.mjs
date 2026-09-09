import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8").replace(/\r\n?/gu, "\n");
const review = read("skills/engineering/code-review/SKILL.md");
const docs = read("docs/engineering/code-review.md");
const metadata = read("skills/engineering/code-review/agents/openai.yaml");
const execute = read("skills/engineering/execute-issue/SKILL.md");

// Structural contract checks; observed model scenarios are recorded separately.
test("explicit review sources precede discovery and keep source limitations", () => {
  assert.match(review, /explicitly designated.*human or owning workflow.*precedence.*discovered/isu);
  assert.match(review, /conversation.*file.*Issue/isu);
  assert.match(review, /unavailable or conflicting.*limitation.*(?:never|do not).*substitut/isu);
  assert.doesNotMatch(review, /Look for the originating spec, in this order/iu);
  assert.match(review, /tracker.*only when.*chosen source or owning workflow requires/isu);
});

test("frozen review inputs preserve conversational authority without new approval", () => {
  assert.match(review, /exact applicable requirement statements.*provenance/isu);
  assert.match(review, /accepted requirements.*assumptions.*unaccepted assistant proposals/isu);
  assert.match(review, /(?:no|without).*physical Spec.*Issue.*renewed approval/isu);
  assert.match(review, /every reviewer.*without inherited conversation/isu);
  const specBrief = review.split("**Spec reviewer brief**")[1].split("### 6.")[0];
  assert.match(specBrief, /frozen requirement.*provenance/isu);
  assert.match(review, /low-risk inline review.*same frozen/isu);
});

test("unassessed Spec is distinct from a clean assessed axis", () => {
  assert.match(review, /standalone general review.*Standards.*Spec not assessed/isu);
  assert.match(review, /Spec not assessed.*(?:neither|not).*Spec pass.*complete acceptance/isu);
  assert.match(review, /assessed axis is clean/iu);
  assert.match(review, /unassessed.*(?:not|never).*zero.finding/isu);
  assert.doesNotMatch(review, /If nothing is found, ask the user where the spec is/iu);
});

test("formal Issue delivery retains its governing Spec and independent gates", () => {
  assert.match(review, /execute-issue.*governing published Spec.*Standards and Spec/isu);
  assert.match(review, /conversation.*published.*scope.*revision route/isu);
  assert.match(review, /Material security, data, concurrency, migration, contract, or cross-module risk requires independent reviewers/iu);
  assert.match(execute, /Read the Issue, parent or linked Spec, comments/iu);
  assert.match(execute, /Scope change.*stops for planning/isu);
  assert.match(execute, /configured typechecking and the repository full suite for the committed candidate/iu);
  assert.match(execute, /at most 10 repair waves/iu);
  assert.match(execute, /Require clean Standards and Spec/iu);
});

test("human docs and metadata expose the same source and assessment boundaries", () => {
  assert.match(docs, /explicitly designated.*conversation.*file.*Issue/isu);
  assert.match(docs, /provenance/iu);
  assert.match(docs, /Spec not assessed/iu);
  assert.match(docs, /governing published Spec/iu);
  assert.match(metadata, /explicit.*conversation.*Spec not assessed/isu);
  assert.doesNotMatch(docs, /no spec available/iu);
});
