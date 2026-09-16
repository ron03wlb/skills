import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Packaging/reference checks only. Model behavior is exercised separately in
// fixtures/grilling-scenarios.md; matching instruction wording cannot prove it.
const root = new URL("../../", import.meta.url);
const read = (path) =>
  readFileSync(new URL(path, root), "utf8").replace(/\r\n?/gu, "\n");
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
    assert.ok(
      read("skills/" + entry + "/SKILL.md").includes("name: " + name + "\n"),
      entry,
    );
    assert.ok(index.includes("./skills/" + entry + "/SKILL.md"), entry);
    assert.ok(
      read("skills/" + bucket + "/README.md").includes(
        "./" + name + "/SKILL.md",
      ),
      entry,
    );
    assert.ok(router.includes("/" + name), entry);
    const docs = read("docs/" + entry + ".md");
    for (const heading of [
      "What it does",
      "When to reach for it",
      "Where it fits",
    ]) {
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
    for (const [, href] of read(path).matchAll(
      /\]\(([^)]+\.md(?:#[^)]+)?)\)/gu,
    )) {
      if (/^https?:/u.test(href)) continue;
      const target = new URL(href, new URL(path, root));
      const anchor = target.hash.slice(1);
      target.hash = "";
      const content = readFileSync(target, "utf8");
      if (anchor) {
        const anchors = [...content.matchAll(/^#+ (.+)$/gmu)].map((match) =>
          match[1]
            .trim()
            .toLowerCase()
            .replace(/[^\w -]/gu, "")
            .replace(/ /gu, "-"),
        );
        assert.ok(anchors.includes(anchor), path + ": " + href);
      }
    }
  }
});

test("grill-with-docs preserves its optional Pi dialog contract", () => {
  const skill = read("skills/engineering/grill-with-docs/SKILL.md");
  const docs = read("docs/engineering/grill-with-docs.md");

  assert.match(
    skill,
    /When Pi exposes `ask_user_question`, use it only as an optional presentation for ready, independent human-frontier leaves; its availability never widens the aperture\./u,
  );
  assert.match(skill, /Put 1–4 leaves in a dialog/u);
  assert.match(
    skill,
    /single-select question with a short header, a question-ending prompt, and 2–4 distinct options/u,
  );
  assert.match(skill, /plus a fixed `Explain` option/u);
  assert.match(skill, /`Explain` does not settle a decision/u);
  assert.match(skill, /then ask that leaf again/u);
  assert.match(
    skill,
    /Free text or a substantive option settles a leaf only when it states a clear human decision/u,
  );
  assert.match(
    skill,
    /A user cancellation settles none of that dialog's leaves and preserves the lane and frontier/u,
  );
  assert.match(
    skill,
    /no UI, load, or validation failure preserves the leaves and falls back to the existing text questions/u,
  );
  assert.match(
    skill,
    /Neither dialog answers nor explanation grant document writes, SQL, implementation, publication, or handoff authority/u,
  );

  assert.match(docs, /optional presentation enhancement/u);
  assert.match(docs, /pi install npm:@juicesharp\/rpiv-ask-user-question/u);
  assert.match(
    docs,
    /Restart Pi afterwards\. The extension requires Node\.js 22\+ and an interactive terminal or RPC\/ACP host\./u,
  );
  assert.match(
    docs,
    /needs no changes to the extension's user configuration file/u,
  );
  assert.match(
    docs,
    /Choosing `Explain` gives the context, evidence, trade-offs, and recommendation, then asks that same decision again without recording it\./u,
  );
  assert.match(
    docs,
    /A cancelled dialog records none of its answers and keeps the planning lane and frontier ready/u,
  );

  for (const path of [
    "skills/engineering/grill-with-docs/SKILL.md",
    "package.json",
    ".claude-plugin/plugin.json",
  ]) {
    assert.ok(!read(path).includes("@juicesharp/rpiv-ask-user-question"), path);
  }
});

test("decision policy ADRs retain their supersession chain", () => {
  const oldAdr = read(
    "docs/adr/0068-delegate-reversible-design-decisions-and-gate-sql.md",
  );
  const apertureAdr = read(
    "docs/adr/0070-use-a-boundary-first-decision-aperture.md",
  );
  const currentAdr = read(
    "docs/adr/0071-reserve-boundaries-and-migration-costs.md",
  );

  assert.match(oldAdr, /^status: superseded by ADR-0070$/mu);
  assert.match(apertureAdr, /^status: superseded by ADR-0071$/mu);
  assert.match(currentAdr, /^status: accepted$/mu);
});
