import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connectGitHubProducer, conflict } from "./github-producer-transport.mjs";
import { createGitHubToTicketsAdapters } from "./github-to-tickets-adapters.mjs";

const readConfiguration = path => {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw conflict("GitHub producer configuration is unreadable"); }
};

// Read-only capability inspection: the binding, the connection, and the selection policy. The concrete
// child/parent representation is probed per Spec before that Spec's first mutation.
export async function inspectGitHubToTickets({ repository, transport }) {
  repository = realpathSync.native(repository);
  const configurationPath = join(repository, "docs/agents/github-producer.json");
  if (!existsSync(configurationPath)) {
    return { state: "MISSING", owningSource: configurationPath,
      nextAction: "Explicitly run github-producer-entry.mjs configure for this repository." };
  }
  const connected = await connectGitHubProducer({ repository, configuration: readConfiguration(configurationPath), transport });
  return { state: "PRESENT", owningSource: fileURLToPath(new URL("./github-to-tickets-adapters.mjs", import.meta.url)),
    configuration: configurationPath, repositoryId: connected.repositoryId, repositoryName: connected.repositoryName,
    publicationMode: "READ_WRITE_READBACK",
    support: { producer: "to-tickets@v2", blockingRepresentation: "probed-per-Spec",
      nativeParentRelation: "probed-per-Spec", parentFallback: "canonical-body",
      representationPolicy: "native when native sub-issue and dependency reads are proven for the Spec, otherwise canonical-body",
      automaticRunHost: false } };
}

export async function invokeGitHubToTickets({ repository, input, transport, execute, capability }) {
  const configurationPath = join(repository, "docs/agents/github-producer.json");
  if (!existsSync(configurationPath)) {
    throw conflict("The repository has no GitHub producer binding; explicitly run github-producer-entry.mjs configure.");
  }
  const configuration = readConfiguration(configurationPath);
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
  const adapter = await createGitHubToTicketsAdapters({ repository, configuration, transport, execute, capability,
    specId: input.specId, target: input.target, upstreamHandoffIdentity: input.upstreamHandoffIdentity,
    readyLabel: input.readyLabel, blockingRepresentation: input.blockingRepresentation });
  const [group, method] = allowed[input.action];
  return adapter[group][method](input.request ?? {});
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  const [action, repository] = process.argv.slice(2);
  try {
    if (!repository) throw conflict("Usage: github-to-tickets-entry.mjs <inspect|invoke> <repository>; invoke reads one JSON request from stdin.");
    const result = action === "inspect" ? await inspectGitHubToTickets({ repository })
      : action === "invoke" ? await invokeGitHubToTickets({ repository, input: JSON.parse(readFileSync(0, "utf8")) })
        : (() => { throw conflict("Unknown to-tickets entry action"); })();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ state: "BLOCKED", code: error.code ?? "GITHUB_TO_TICKETS_ERROR", reason: error.message })}\n`);
    process.exitCode = 1;
  }
}
