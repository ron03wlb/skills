import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connectGitLabProducer, configurationFromRemote, conflict, validateConfiguration } from "./gitlab-producer-transport.mjs";
import { createGitLabProducerAdapters } from "./gitlab-producer-adapters.mjs";
import { createGitPlanningSeal } from "./git-planning-seal.mjs";

const readConfiguration = path => {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw conflict("GitLab producer configuration is unreadable"); }
};

export async function configureGitLabProducer({ repository, configuration, transport }) {
  repository = realpathSync.native(repository);
  const path = join(repository, "docs/agents/gitlab-producer.json");
  const candidate = validateConfiguration(configuration ?? (existsSync(path) ? readConfiguration(path) : configurationFromRemote(repository)));
  const connected = await connectGitLabProducer({ repository, configuration: candidate, transport });
  if (existsSync(path)) {
    const existing = validateConfiguration(readConfiguration(path));
    if (existing.baseUrl !== candidate.baseUrl || existing.project !== candidate.project) throw conflict("Existing binding differs; review it explicitly before replacement");
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(candidate, null, 2)}\n`, { encoding: "utf8", flag: "wx", flush: true });
  }
  return { state: "CONFIGURED", path, repositoryId: connected.repositoryId, publicationMode: "READ_WRITE_READBACK" };
}

export async function inspectGitLabProducer({ repository, transport }) {
  const path = join(repository, "docs/agents/gitlab-producer.json");
  if (!existsSync(path)) return { state: "MISSING", owningSource: path, nextAction: "Explicitly run gitlab-producer-entry.mjs configure for this repository." };
  const configuration = readConfiguration(path);
  const connected = await connectGitLabProducer({ repository, configuration, transport });
  // `automaticRunHost` is the configured tracker's own capability, read beside it: this binding plus the
  // installed Run entry's GitLab Tracker Run sources make the project Run-ready, exactly as the GitHub
  // composition already does for a GitHub repository.
  return { state: "PRESENT", owningSource: fileURLToPath(new URL("./gitlab-producer-adapters.mjs", import.meta.url)),
    configuration: path, repositoryId: connected.repositoryId, projectId: connected.projectId, publicationMode: "READ_WRITE_READBACK",
    support: { producer: "to-spec@v2", modes: ["primary", "revision"], planning: "registered-documents-and-tracker-only", automaticRunHost: true } };
}

export async function invokeGitLabProducer({ repository, input, transport }) {
  const configuration = readConfiguration(join(repository, "docs/agents/gitlab-producer.json"));
  if (input?.action === "lane-allocate") {
    const connection = await connectGitLabProducer({ repository, configuration, transport });
    return createGitPlanningSeal({ repository: connection.repository, repositoryId: connection.repositoryId,
      specId: input.request?.proposedSpecIdentity, target: input.target, gitCommonDir: connection.gitCommonDir }).allocateLane(input.request);
  }
  const allowed = {
    read: ["tracker", "read"], reserve: ["tracker", "reserve"], baseline: ["planning", "readBaseline"], seal: ["planningSeal", "read"],
    "lane-register": ["planning", "registerLane"], "lane-read": ["planning", "readLane"], "lane-dispose": ["planning", "disposeLane"], "seal-write": ["planningSeal", "write"],
    identity: ["checkpoint", "identity"], "checkpoint-read": ["checkpoint", "read"], "checkpoint-create": ["checkpoint", "create"],
    "checkpoint-advance": ["checkpoint", "advance"], publish: ["tracker", "publish"], "mutation-read": ["tracker", "readMutation"],
    "handoff-read": ["handoff", "read"], "handoff-append": ["handoff", "append"],
  };
  if (!Object.hasOwn(allowed, input?.action)) throw conflict("Unknown producer action");
  const adapter = await createGitLabProducerAdapters({ repository, configuration, transport,
    specId: input.specId, target: input.target, publication: input.publication });
  const [group, method] = allowed[input.action];
  return adapter[group][method](input.request);
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  const [action, repository, ...rest] = process.argv.slice(2);
  // An SSH remote cannot describe its own HTTPS origin, so the human's two explicit values are passed to
  // this owner — which validates them and writes the binding — instead of being written by hand.
  const flag = (name) => {
    const index = rest.indexOf(name);
    return index === -1 ? null : rest[index + 1] ?? null;
  };
  const explicitOrigin = flag("--base-url");
  const explicitProject = flag("--project");
  try {
    if (!repository) throw conflict("Usage: gitlab-producer-entry.mjs <configure|inspect|invoke> <repository>; configure also accepts --base-url <origin> --project <path> for an SSH remote, and invoke reads one JSON request from stdin.");
    if (action === "configure" && (explicitOrigin === null) !== (explicitProject === null)) {
      throw conflict("configure needs both --base-url and --project, or neither");
    }
    const result = action === "configure" ? await configureGitLabProducer({ repository,
      configuration: explicitOrigin === null ? undefined : { schema: "gitlab-producer:v1", baseUrl: explicitOrigin, project: explicitProject } })
      : action === "inspect" ? await inspectGitLabProducer({ repository })
        : action === "invoke" ? await invokeGitLabProducer({ repository, input: JSON.parse(readFileSync(0, "utf8")) })
          : (() => { throw conflict("Unknown producer entry action"); })();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ state: "BLOCKED", code: error.code ?? "GITLAB_PRODUCER_ERROR", reason: error.message })}\n`);
    process.exitCode = 1;
  }
}
