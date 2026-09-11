import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connectGitLabProducer, conflict } from "./gitlab-producer-transport.mjs";
import { createGitLabToTicketsAdapters } from "./gitlab-to-tickets-adapters.mjs";

export function readGitLabBlockingRepresentation(repository) {
  const path = join(repository, "docs/agents/issue-tracker.md");
  if (!existsSync(path)) return { state: "UNKNOWN", owningSource: path,
    nextAction: "Configure the repository issue tracker and declare Blocking representation: body or native." };
  const contents = readFileSync(path, "utf8");
  const declarations = [...contents.matchAll(/^Blocking representation:\s*([^\r\n]+)\s*$/gmu)].map(match => match[1].trim());
  if (declarations.length !== 1 || !["body", "native"].includes(declarations[0])) {
    return { state: "UNKNOWN", owningSource: path,
      nextAction: "Set exactly one Blocking representation: body or Blocking representation: native declaration." };
  }
  return { state: "PRESENT", owningSource: path, blockingRepresentation: declarations[0] };
}

export async function inspectGitLabToTickets({ repository, transport }) {
  repository = realpathSync.native(repository);
  const configurationPath = join(repository, "docs/agents/gitlab-producer.json");
  if (!existsSync(configurationPath)) return { state: "MISSING", owningSource: configurationPath,
    nextAction: "Explicitly run gitlab-producer-entry.mjs configure for this repository." };
  const configuration = JSON.parse(readFileSync(configurationPath, "utf8"));
  const connected = await connectGitLabProducer({ repository, configuration, transport });
  const representation = readGitLabBlockingRepresentation(repository);
  if (representation.state !== "PRESENT") return { ...representation, configuration: configurationPath,
    repositoryId: connected.repositoryId, projectId: connected.projectId };
  return { state: "PRESENT", owningSource: fileURLToPath(new URL("./gitlab-to-tickets-adapters.mjs", import.meta.url)),
    configuration: configurationPath, trackerConfiguration: representation.owningSource,
    repositoryId: connected.repositoryId, projectId: connected.projectId, publicationMode: "READ_WRITE_READBACK",
    support: { producer: "to-tickets@v2", blockingRepresentation: representation.blockingRepresentation,
      nativeParentRelation: false, parentFallback: "canonical-body", automaticRunHost: false } };
}

export async function invokeGitLabToTickets({ repository, input, transport }) {
  const configuration = JSON.parse(readFileSync(join(repository, "docs/agents/gitlab-producer.json"), "utf8"));
  const representation = readGitLabBlockingRepresentation(repository);
  if (representation.state !== "PRESENT") throw conflict(representation.nextAction);
  const allowed = {
    "upstream-publication": ["upstream", "readPublication"],
    "upstream-handoff": ["upstream", "readHandoff"],
    identity: ["checkpoint", "identity"],
    "checkpoint-read": ["checkpoint", "read"],
    "checkpoint-create": ["checkpoint", "create"],
    "checkpoint-advance": ["checkpoint", "advance"],
    "children-discover": ["tracker", "discoverChildren"],
    "child-read": ["tracker", "readChild"],
    "child-publish": ["tracker", "publishChild"],
    "child-mutation-read": ["tracker", "readChildMutation"],
    "child-update": ["tracker", "updateChild"],
    "child-update-mutation-read": ["tracker", "readChildUpdateMutation"],
    "relation-read": ["tracker", "readRelation"],
    "relation-publish": ["tracker", "publishRelation"],
    "relation-mutation-read": ["tracker", "readRelationMutation"],
    "partial-relations-read": ["tracker", "readPartialRelations"],
    "decomposition-read": ["tracker", "readDecomposition"],
    "decomposition-publish": ["tracker", "publishDecomposition"],
    "ready-read": ["tracker", "readReadyState"],
    "ready-write": ["tracker", "writeReadyState"],
    "handoff-read": ["handoff", "read"],
    "handoff-append": ["handoff", "append"],
  };
  if (!Object.hasOwn(allowed, input?.action)) throw conflict("Unknown to-tickets producer action");
  const adapter = await createGitLabToTicketsAdapters({ repository, configuration, transport,
    blockingRepresentation: representation.blockingRepresentation, specId: input.specId, target: input.target,
    upstreamHandoffIdentity: input.upstreamHandoffIdentity, readyLabel: input.readyLabel });
  const [group, method] = allowed[input.action];
  return adapter[group][method](input.request ?? {});
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  const [action, repository] = process.argv.slice(2);
  try {
    if (!repository) throw conflict("Usage: gitlab-to-tickets-entry.mjs <inspect|invoke> <repository>; invoke reads one JSON request from stdin.");
    const result = action === "inspect" ? await inspectGitLabToTickets({ repository })
      : action === "invoke" ? await invokeGitLabToTickets({ repository, input: JSON.parse(readFileSync(0, "utf8")) })
        : (() => { throw conflict("Unknown to-tickets entry action"); })();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ state: "BLOCKED", code: error.code ?? "GITLAB_TO_TICKETS_ERROR", reason: error.message })}\n`);
    process.exitCode = 1;
  }
}
