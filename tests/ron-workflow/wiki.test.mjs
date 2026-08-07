import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { validateWikiLinks, validateWikiPage, validateWikiSources } from "../../skills/engineering/wiki/scripts/wiki-validate.mjs";

function page(link = "", source = { id: "S1", path: "src/orders.mjs", kind: "symbol", value: "acceptOrder" }) {
  return [
    "# Orders", "", "## Purpose and scope", "Order behavior. [S1]", "", "## Current behavior", `Orders are accepted. [S1] ${link}`.trim(), "",
    "## Rules and invariants", "Identifiers are stable. [S1]", "", "## Dependencies", "The contract is local. [S1]", "", "## Sources", "```json",
    JSON.stringify({ schema: "wiki-sources:v1", sources: [source] }, null, 2),
    "```", "",
  ].join("\n");
}

test("Wiki validation checks page contract, source paths, links, and anchors", (t) => {
  const root = mkdtempSync(join(tmpdir(), "wiki-validator-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "wiki"));
  writeFileSync(join(root, "src/orders.mjs"), "export function acceptOrder() {}\n", "utf8");
  writeFileSync(join(root, "wiki/details.md"), "# Details\n\n## Rules\n", "utf8");
  const markdown = page("[Details](details.md#rules)");
  writeFileSync(join(root, "wiki/orders.md"), markdown, "utf8");

  assert.equal(validateWikiPage(markdown).status, "valid");
  assert.equal(validateWikiPage(page().replace("Orders are accepted. [S1]", "Orders are accepted. [S1]\n\n~~~md\n# Example H1\n## Sources\n[S999]\n~~~")).status, "valid");
  assert.throws(() => validateWikiPage(markdown.replace("src/orders.mjs", "./src/orders.mjs")), /repository-relative/u);
  assert.throws(() => validateWikiPage(markdown.replace("src/orders.mjs", "src/./orders.mjs")), /repository-relative/u);
  assert.equal(validateWikiSources(root, markdown).sources_checked, 1);
  assert.equal(validateWikiLinks(root, "wiki").links_checked, 1);
  assert.throws(() => validateWikiPage(markdown.replace("Identifiers are stable. [S1]", "Identifiers are stable.")), /unmapped claim/u);
  assert.throws(() => validateWikiSources(root, markdown.replace("src/orders.mjs", "src/missing.mjs")), /not a repository file/u);
  assert.throws(() => validateWikiSources(root, markdown.replace("acceptOrder", "missingSymbol")), /resolve exactly once/u);
  writeFileSync(join(root, "src/orders.mjs"), "/*\nexport function acceptOrder() {}\n*/\nconst sample = `\nexport function acceptOrder() {}\n`;\n", "utf8");
  assert.throws(() => validateWikiSources(root, markdown), /resolve exactly once/u);
  const testMarkdown = markdown.replace('"kind": "symbol"', '"kind": "test"').replace('"value": "acceptOrder"', '"value": "accepting an order works"');
  writeFileSync(join(root, "src/orders.mjs"), 'test("accepting an order works", () => {});\n', "utf8");
  assert.equal(validateWikiSources(root, testMarkdown).sources_checked, 1);
  assert.throws(() => validateWikiSources(root, testMarkdown.replace("accepting an order works", "missing test title")), /resolve exactly once/u);
  writeFileSync(join(root, "src/orders.mjs"), "export function acceptOrder() {}\nexport function acceptOrder() {}\n", "utf8");
  assert.throws(() => validateWikiSources(root, markdown), /resolve exactly once/u);
  writeFileSync(join(root, "src/orders.mjs"), "export function acceptOrder() {}\n", "utf8");

  const outside = mkdtempSync(join(tmpdir(), "wiki-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, "escape.mjs"), "export function acceptOrder() {}\n", "utf8");
  symlinkSync(outside, join(root, "linked-source"), "junction");
  assert.throws(() => validateWikiSources(root, markdown.replace("src/orders.mjs", "linked-source/escape.mjs")), /escapes the repository/u);
  writeFileSync(join(root, "wiki/orders.md"), page("[Missing](missing.md)"), "utf8");
  assert.throws(() => validateWikiLinks(root, "wiki"), /unresolved Wiki link/u);
});

test("Wiki source locators ignore lookalikes and resolve durable qualified paths", (t) => {
  const root = mkdtempSync(join(tmpdir(), "wiki-locators-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "config"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "wiki"));

  writeFileSync(join(root, "wiki/source.md"), "```md\n# Hidden heading\n```\n\n## Visible heading\n", "utf8");
  assert.equal(validateWikiSources(root, page("", { id: "S1", path: "wiki/source.md", kind: "heading", value: "Visible heading" })).sources_checked, 1);
  assert.throws(() => validateWikiSources(root, page("", { id: "S1", path: "wiki/source.md", kind: "heading", value: "Hidden heading" })), /resolve exactly once/u);

  writeFileSync(join(root, "config/app.yaml"), "orders:\n  retry:\n    limit: 3\ndescription: |\n  hidden: value\n", "utf8");
  assert.equal(validateWikiSources(root, page("", { id: "S1", path: "config/app.yaml", kind: "config-key", value: "orders.retry.limit" })).sources_checked, 1);
  assert.throws(() => validateWikiSources(root, page("", { id: "S1", path: "config/app.yaml", kind: "config-key", value: "hidden" })), /resolve exactly once/u);

  writeFileSync(join(root, "config/app.toml"), '[orders.retry]\nlimit = 3\ndescription = """\nhidden = true\n"""\n', "utf8");
  assert.equal(validateWikiSources(root, page("", { id: "S1", path: "config/app.toml", kind: "config-key", value: "orders.retry.limit" })).sources_checked, 1);
  assert.throws(() => validateWikiSources(root, page("", { id: "S1", path: "config/app.toml", kind: "config-key", value: "hidden" })), /resolve exactly once/u);

  writeFileSync(join(root, "config/.env"), "export ORDERS_RETRY_LIMIT=3\n", "utf8");
  assert.equal(validateWikiSources(root, page("", { id: "S1", path: "config/.env", kind: "config-key", value: "ORDERS_RETRY_LIMIT" })).sources_checked, 1);

  writeFileSync(join(root, "src/orders.ts"), "import { symlinkSync } from 'node:fs';\nclass Orders {\n  accept() {}\n}\nsymlinkSync('a', 'b');\ntest.concurrent('accepts concurrently', () => {});\n", "utf8");
  assert.equal(validateWikiSources(root, page("", { id: "S1", path: "src/orders.ts", kind: "symbol", value: "Orders.accept" })).sources_checked, 1);
  assert.throws(() => validateWikiSources(root, page("", { id: "S1", path: "src/orders.ts", kind: "symbol", value: "symlinkSync" })), /resolve exactly once/u);
  assert.equal(validateWikiSources(root, page("", { id: "S1", path: "src/orders.ts", kind: "test", value: "accepts concurrently" })).sources_checked, 1);

  writeFileSync(join(root, "src/orders.py"), '"""\ndef hidden_docstring():\n    pass\n"""\nclass OrderTests:\n    def test_cancel(self):\n        pass\n', "utf8");
  assert.equal(validateWikiSources(root, page("", { id: "S1", path: "src/orders.py", kind: "test", value: "OrderTests.test_cancel" })).sources_checked, 1);
  assert.throws(() => validateWikiSources(root, page("", { id: "S1", path: "src/orders.py", kind: "symbol", value: "hidden_docstring" })), /resolve exactly once/u);
});

test("Wiki links ignore fences and resolve supported Markdown targets", (t) => {
  const root = mkdtempSync(join(tmpdir(), "wiki-links-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "wiki"));
  writeFileSync(join(root, "wiki/details.mdx"), "# Details\n\n## Rule\n\n## Rule\n\n## cafe\u0301_name--x\n\n```md\n# Ghost\n```\n", "utf8");
  writeFileSync(join(root, "wiki/asset.png"), "asset", "utf8");
  writeFileSync(join(root, "wiki/index.md"), [
    "# Index",
    "[Angle](<details.mdx#rule-1>)",
    "[Reference][DETAILS]",
    "[details]: details.mdx#rule",
    "[Collapsed][]",
    "[collapsed]: details.mdx#rule",
    "A claim can cite multiple sources. [S1][S2]",
    "[[details#rule]]",
    "![Asset](asset.png)",
    "[Unicode](details.mdx#cafe%CC%81_name--x)",
    "```md",
    "[Example](missing.md)",
    "```",
    "",
  ].join("\n"), "utf8");
  assert.equal(validateWikiLinks(root, "wiki").links_checked, 6);

  writeFileSync(join(root, "wiki/index.md"), "[Ghost](details.mdx#ghost)\n", "utf8");
  assert.throws(() => validateWikiLinks(root, "wiki"), /unresolved Wiki anchor/u);
  writeFileSync(join(root, "wiki/index.md"), "![Missing](missing.png)\n", "utf8");
  assert.throws(() => validateWikiLinks(root, "wiki"), /unresolved Wiki link/u);
  writeFileSync(join(root, "wiki/index.md"), "[missing]: missing.md\n", "utf8");
  assert.throws(() => validateWikiLinks(root, "wiki"), /unresolved Wiki link/u);
  writeFileSync(join(root, "wiki/index.md"), "[Missing][undefined]\n", "utf8");
  assert.throws(() => validateWikiLinks(root, "wiki"), /unresolved Wiki reference/u);
  writeFileSync(join(root, "wiki/index.md"), "[Missing][]\n", "utf8");
  assert.throws(() => validateWikiLinks(root, "wiki"), /unresolved Wiki reference/u);
  writeFileSync(join(root, "wiki/index.md"), "![S1][S2]\n", "utf8");
  assert.throws(() => validateWikiLinks(root, "wiki"), /unresolved Wiki reference/u);

  writeFileSync(join(root, "wiki/details.md"), "# Duplicate target\n", "utf8");
  writeFileSync(join(root, "wiki/index.md"), "[[details]]\n", "utf8");
  assert.throws(() => validateWikiLinks(root, "wiki"), /ambiguous Wiki link/u);
});

test("Wiki CLI preserves non-ASCII through UTF-8 files", (t) => {
  const root = mkdtempSync(join(tmpdir(), "wiki-cli-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = join(root, "input.json");
  const output = join(root, "output.json");
  writeFileSync(input, JSON.stringify({ markdown: page().replace("# Orders", "# 訂單") }), "utf8");
  const result = spawnSync(process.execPath, ["skills/engineering/wiki/scripts/wiki-validate.mjs", "page-validate", input, output], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout || result.stderr);
  assert.equal(JSON.parse(readFileSync(output, "utf8")).title, "訂單");
});
