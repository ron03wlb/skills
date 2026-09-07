import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const baseline = "9714cce428597f9ec5edc4b3665d2c0d1f9d7697";
const words = text => text.trim() === "" ? 0 : text.trim().split(/\s+/u).length;
const show = path => execFileSync("git", ["show", `${baseline}:${path}`], { encoding: "utf8" });
const read = path => readFileSync(path, "utf8");
const total = (reader, paths) => paths.reduce((sum, path) => sum + words(reader(path)), 0);

// Fresh publication loads its preparation owner because the producer carries and reads
// that inventory before handoff. SQL is explicitly absent in both selected cases.
const scenarios = [
  {
    name: "fresh-single-publication",
    baselinePaths: [
      "skills/engineering/to-spec/SKILL.md",
      "docs/agents/run-preparation.md",
      "skills/engineering/to-spec/references/spec-publication-interfaces.md",
      "skills/engineering/to-spec/references/single-issue-template.md",
      "skills/personal/run-issue-workflow/references/github-payloads.md",
    ],
    candidatePaths: [
      "skills/engineering/to-spec/SKILL.md",
      "docs/agents/run-preparation.md",
      "skills/engineering/to-spec/references/spec-publication-interfaces.md",
      "skills/engineering/to-spec/references/single-issue-template.md",
      "skills/personal/run-issue-workflow/references/github-payloads.md",
    ],
  },
  {
    name: "fresh-multi-publication",
    baselinePaths: [
      "skills/engineering/to-spec/SKILL.md",
      "docs/agents/run-preparation.md",
      "skills/engineering/to-spec/references/spec-publication-interfaces.md",
      "skills/engineering/to-spec/references/multi-issue-template.md",
      "skills/personal/run-issue-workflow/references/github-payloads.md",
    ],
    candidatePaths: [
      "skills/engineering/to-spec/SKILL.md",
      "docs/agents/run-preparation.md",
      "skills/engineering/to-spec/references/spec-publication-interfaces.md",
      "skills/engineering/to-spec/references/multi-issue-template.md",
      "skills/personal/run-issue-workflow/references/github-payloads.md",
    ],
  },
  {
    name: "executable-close",
    baselinePaths: [
      "skills/engineering/close-issue/SKILL.md",
      "skills/engineering/close-issue/references/operation-identity.md",
      "skills/engineering/close-issue/references/completion-evidence.md",
    ],
    candidatePaths: [
      "skills/engineering/close-issue/SKILL.md",
      "skills/engineering/close-issue/references/operation-identity.md",
      "skills/engineering/close-issue/references/completion-evidence.md",
      "skills/engineering/close-issue/references/close-coordination.md",
      "skills/engineering/close-issue/references/executable-closeout.md",
    ],
  },
  {
    name: "parent-only-close",
    baselinePaths: [
      "skills/engineering/close-issue/SKILL.md",
      "skills/engineering/close-issue/references/operation-identity.md",
    ],
    candidatePaths: [
      "skills/engineering/close-issue/SKILL.md",
      "skills/engineering/close-issue/references/operation-identity.md",
      "skills/engineering/close-issue/references/close-coordination.md",
      "skills/engineering/close-issue/references/parent-closeout.md",
    ],
  },
].map(scenario => ({
  ...scenario,
  baselineWords: total(show, scenario.baselinePaths),
  candidateWords: total(read, scenario.candidatePaths),
}));

const result = {
  convention: "Whitespace-delimited tokens in full UTF-8 files; repeated paths count once per scenario.",
  baseline,
  entries: {
    toSpec: words(read("skills/engineering/to-spec/SKILL.md")),
    closeIssue: words(read("skills/engineering/close-issue/SKILL.md")),
  },
  scenarios,
};

if (result.entries.toSpec > 1200 || result.entries.closeIssue > 1200 || scenarios.some(({ baselineWords, candidateWords }) => candidateWords >= baselineWords)) {
  process.exitCode = 1;
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
