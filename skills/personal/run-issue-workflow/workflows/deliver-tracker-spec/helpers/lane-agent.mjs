// Bundle-local resolution of the delivered Issue worker agent.
//
// pi-workflow resolves a generated agent name only from the project `.pi/agents/` directory, the user
// agent root, or its own bundled agents. A lane whose worker agent does not resolve cannot exist, so
// this reader proves resolution before any lane is materialized and reports a fail-closed stop naming
// the exact path an operator must provision. It reads the agent's own declared tool ceiling so the
// lane can be checked against it.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { LANE_AGENT_NAME, LANE_STOP_CODES } from "../../../scripts/issue-lane.mjs";

export const LANE_AGENT_SCHEMA = "pi-workflow-lane-agent:v1";
export const LANE_AGENT_SOURCE_FILE = "agents/worker.md";

const TOOLS_LINE = /^tools:\s*(.*)$/u;
const LIST_ITEM = /^\s*-\s*(.+)$/u;

// Only the exact tool-list forms the workflow's own agent definitions use are accepted; anything else
// fails closed instead of guessing at a ceiling.
export function parseAgentTools(frontmatterLines) {
  const lines = Array.isArray(frontmatterLines) ? frontmatterLines : [];
  for (const [index, line] of lines.entries()) {
    const match = TOOLS_LINE.exec(line);
    if (!match) continue;
    const inline = match[1].trim();
    if (inline !== "") {
      return inline.split(",").map((tool) => tool.trim()).filter(Boolean);
    }
    const items = [];
    for (const next of lines.slice(index + 1)) {
      const item = LIST_ITEM.exec(next);
      if (!item) break;
      items.push(item[1].trim());
    }
    return items;
  }
  return [];
}

const frontmatterOf = (text) => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(text);
  return match === null ? null : match[1].split(/\r?\n/u);
};

export function resolveLaneAgent({
  cwd,
  homeDir,
  name = LANE_AGENT_NAME,
  canonicalSource = LANE_AGENT_SOURCE_FILE,
  exists = existsSync,
  readFile = (path) => readFileSync(path, "utf8"),
} = {}) {
  if (typeof cwd !== "string" || !cwd) throw new TypeError("Lane agent resolution needs the project checkout");
  if (typeof homeDir !== "string" || !homeDir) throw new TypeError("Lane agent resolution needs the user home directory");
  const candidates = [
    { scope: "project", path: join(cwd, ".pi", "agents", `${name}.md`) },
    { scope: "user", path: join(homeDir, ".pi", "agent", "agents", `${name}.md`) },
  ];
  const found = candidates.find((candidate) => exists(candidate.path));
  if (!found) {
    return Object.freeze({
      schema: LANE_AGENT_SCHEMA,
      name,
      resolved: false,
      scope: null,
      path: candidates.at(-1).path,
      ceiling: [],
      stop: Object.freeze({
        code: LANE_STOP_CODES.agentUnresolved,
        evidence: [
          `Lane agent ${name} resolves from no project or user agent root.`,
          // The user root is the one an operator can provision without editing a target repository.
          ...candidates.map((candidate) => `${candidate.scope} root: ${candidate.path}`),
          `Canonical definition shipped with the skill: ${canonicalSource}`,
        ],
      }),
    });
  }
  const frontmatter = frontmatterOf(readFile(found.path));
  const ceiling = frontmatter === null ? [] : parseAgentTools(frontmatter);
  if (ceiling.length === 0) {
    return Object.freeze({
      schema: LANE_AGENT_SCHEMA,
      name,
      resolved: false,
      scope: found.scope,
      path: found.path,
      ceiling: [],
      stop: Object.freeze({
        code: LANE_STOP_CODES.agentUnresolved,
        evidence: [`Lane agent ${name} at ${found.path} declares no readable tools list.`],
      }),
    });
  }
  return Object.freeze({
    schema: LANE_AGENT_SCHEMA,
    name,
    resolved: true,
    scope: found.scope,
    path: found.path,
    ceiling,
    stop: null,
  });
}
