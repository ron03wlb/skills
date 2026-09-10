import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Packaging/reference checks only. Model behavior is exercised separately in
// fixtures/grilling-scenarios.md; matching instruction wording cannot prove it.
const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8").replace(/\r\n?/gu, "\n");
const entries = [
  "productivity/grilling",
  "productivity/grill-me",
  "engineering/grill-with-docs",
  "engineering/domain-modeling",
  "engineering/to-spec",
];

test("the affected skills remain discoverable through their docs, index and router", () => {
  const router = read("skills/engineering/ask-matt/SKILL.md");
  const index = read("README.md");
  for (const entry of entries) {
    const [bucket, name] = entry.split("/");
    assert.ok(read("skills/" + entry + "/SKILL.md").includes("name: " + name + "\n"), entry);
    assert.ok(index.includes("./skills/" + entry + "/SKILL.md"), entry);
    assert.ok(read("skills/" + bucket + "/README.md").includes("./" + name + "/SKILL.md"), entry);
    assert.ok(router.includes("/" + name), entry);
    const docs = read("docs/" + entry + ".md");
    for (const heading of ["What it does", "When to reach for it", "Where it fits"]) {
      assert.ok(docs.includes("## " + heading + "\n"), entry + ": " + heading);
    }
    assert.ok(docs.includes("https://aihero.dev/skills-ask-matt"), entry);
  }
});

test("shared decision and ADR references resolve to existing documents and anchors", () => {
  for (const path of [
    "skills/engineering/domain-modeling/SKILL.md",
    "skills/productivity/grilling/SKILL.md",
    "docs/agents/run-preparation.md",
  ]) {
    for (const [, href] of read(path).matchAll(/\]\(([^)]+\.md(?:#[^)]+)?)\)/gu)) {
      if (/^https?:/u.test(href)) continue;
      const target = new URL(href, new URL(path, root));
      const anchor = target.hash.slice(1);
      target.hash = "";
      const content = readFileSync(target, "utf8");
      if (anchor) {
        const anchors = [...content.matchAll(/^#+ (.+)$/gmu)]
          .map((match) => match[1].trim().toLowerCase().replace(/[^\w -]/gu, "").replace(/ /gu, "-"));
        assert.ok(anchors.includes(anchor), path + ": " + href);
      }
    }
  }
});
