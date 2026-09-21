// GitLab Tracker Run sources.
//
// The sibling composition ADR-0081 accepts: it answers exactly the owning-source surface
// `createGitHubWorkflowSources` answers — repository identity, tracker read, reconciliation, target,
// checkpoint, handoff, target-writer health, Run selection, plus the composition-level Issue reads — for
// a configured GitLab project, and nothing else changes. It reuses the domain authority, the Run store,
// the Git journal and the existing `glab` producer transport rather than adding a second transport or a
// second durable store.
//
// Two GitLab facts shape this module and nothing else: the stable Issue identity is the Issue's web URL
// (what every GitLab producer records), and a note's trust is a live project membership read rather than
// an author association, so the tracker reads are asynchronous. Blocker authority stays the published
// `decomposition:v1` body graph: this composition publishes no tracker relation and never probes native
// blocking or Issue hierarchy capability.
import {
  existsSync,
  lstatSync,
  readdirSync,
  realpathSync,
  readFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  assessRunPreparation,
  assessBootstrapHandoff,
  readManualAttestation,
} from "./run-preparation.mjs";
import {
  assertWorkflowOperationIdentity,
  automaticUpgrade,
  bindProducerCheckpointOperationIdentity,
  bindTechnicalFailure,
  creationUnavailable,
  deriveExecuteIssueOperationIdentity,
  deriveRunOperationIdentity,
  modelDecisionInput,
  modelEvidenceDigest,
  planCloseContinuation,
  readMaintenanceProgress,
  readModelRepairBaseline,
  readRepairProgress,
  readRepairWaveCount,
  reduceRun,
  reduceRunReadyHandoff,
  sameRecoveryTask,
  validateExecutionResolution,
  validateMaintenanceResult,
  validateRepairCompletion,
  validateRepairYield,
  validateVerificationResolution,
} from "./delivery-authority.mjs";
import {
  bodyDigest,
  readWorkflowRecords,
  legacyCompletionAllowed,
} from "./gitlab-workflow-records.mjs";
import { createWorkflowControlStore } from "./workflow-control-store.mjs";
import { selectRevisionLifecycle } from "./gitlab-revision-lifecycle.mjs";
import {
  connectGitLabProducer,
  validateConfiguration,
} from "./gitlab-producer-transport.mjs";
import { createIntegrationVerification } from "../../../engineering/execute-issue/scripts/verification-cache.mjs";
import { selectWorkflowVersion } from "./workflow-installation.mjs";
import { runWorkflowCommand } from "./workflow-command.mjs";
import {
  COMMIT_PATTERN as sha,
  authorityConflict,
  canonicalWorktreePath as worktreePath,
  createAutomaticHostCleanupPacket,
  createTrackerWorkflowCore,
  declaresManualPrerequisite,
  exactlyOne as one,
  isAutomaticHostCleanupReason,
  isCompleteVerificationEvidence,
  normalizeWorkflowHandoff,
} from "./tracker-workflow-core.mjs";

const sectionOf = (body, heading) => {
  const lines = String(body ?? "").replace(/\r\n/gu, "\n").split("\n");
  const marker = `## ${heading}`;
  const indexes = lines.flatMap((line, index) => (line === marker ? [index] : []));
  if (indexes.length !== 1) throw authorityConflict(`Issue body must contain one ${marker} section`);
  const end = lines.findIndex((line, index) => index > indexes[0] && line.startsWith("## "));
  return lines.slice(indexes[0] + 1, end < 0 ? lines.length : end).join("\n").trim();
};

export { isAutomaticHostCleanupReason, createAutomaticHostCleanupPacket };

export async function createGitLabWorkflowSources({
  repository,
  store,
  tasks,
  workflowVersion,
  installationCacheDirectory,
  commandRunner = runWorkflowCommand,
  // The configured binding and the producer transport are injectable so a caller can prove which
  // installed owner this composition read the project through; production reads the repository-owned
  // binding and the existing `glab` transport.
  configuration = null,
  transport = null,
}) {
  repository = realpathSync.native(repository);
  const bindingPath = join(repository, "docs/agents/gitlab-producer.json");
  let configured = configuration;
  if (configured === null && existsSync(bindingPath)) {
    try {
      configured = JSON.parse(readFileSync(bindingPath, "utf8"));
    } catch (error) {
      throw authorityConflict(`The configured GitLab tracker binding is unreadable: ${error.message}`);
    }
  }
  if (configured === null)
    throw authorityConflict(
      "A configured GitLab tracker binding is required: docs/agents/gitlab-producer.json is missing",
    );
  const settings = validateConfiguration(configured);
  // The existing producer transport owns the transport, the project identity and the membership read;
  // this composition adds none of them.
  const connection = await connectGitLabProducer({
    repository,
    configuration: settings,
    transport,
  });
  const { repositoryId, projectUrl, projectId, api, list, assertAuthor } = connection;
  const project = settings.project;
  let commandCalls = 0;
  const command = (name, args, options = {}) => {
    commandCalls += 1;
    return commandRunner(name, args, {
      cwd: repository,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      ...options,
    });
  };
  const git = (...args) => command("git", args);
  const gitCommonDir = connection.gitCommonDir;
  const checkpoints = createWorkflowControlStore({ gitCommonDir });
  const numbers = new Map();
  // A GitLab Issue locator is its native iid or its exact web URL inside the configured project. Both
  // resolve to the same iid, and the stable identity every GitLab producer records is the web URL.
  const issueIid = (locator) => {
    const raw = String(locator ?? "");
    const candidate = raw.startsWith(`${projectUrl}/-/issues/`)
      ? raw.slice(`${projectUrl}/-/issues/`.length)
      : raw;
    if (!/^[1-9][0-9]*$/u.test(candidate) || !Number.isSafeInteger(Number(candidate)))
      throw authorityConflict(
        "Issue locator is outside the configured GitLab project or is malformed",
      );
    return Number(candidate);
  };
  const issueIdentity = (iid) => `${projectUrl}/-/issues/${iid}`;
  const validateIssue = (issue, iid) => {
    if (
      issue?.project_id !== projectId ||
      issue.iid !== iid ||
      issue.web_url !== issueIdentity(iid) ||
      issue.issue_type !== "issue" ||
      !Array.isArray(issue.labels) ||
      !["opened", "closed"].includes(issue.state)
    ) {
      throw authorityConflict(
        "Native GitLab Issue identity is unreadable or differs",
      );
    }
    // The neutral derivation reads the GitHub spellings (`open`/`closed`); normalize once, here, instead
    // of teaching every fact derivation two vocabularies.
    return { ...issue, state: issue.state === "opened" ? "open" : "closed" };
  };
  const readIssue = async (locator) => {
    const iid = issueIid(locator);
    const issue = validateIssue(await api(`/issues/${iid}`), iid);
    const identity = issue.web_url;
    numbers.set(identity, iid);
    numbers.set(String(iid), iid);
    const comments = (await list(`/issues/${iid}/notes`)).map((note) => ({
      ...note,
      node_id: `${identity}#note_${note.id}`,
    }));
    let records;
    try {
      records = await readWorkflowRecords({
        notes: comments,
        repositoryId,
        issueIdentity: identity,
        issueIid: iid,
        assertAuthor,
        // The change detector: every accepted record's own note is re-read, so a note edited between the
        // list read and this read stops the whole tracker read instead of contributing stale evidence.
        reReadNote: (noteId) => api(`/issues/${iid}/notes/${noteId}`),
      });
    } catch (error) {
      throw authorityConflict(error.message);
    }
    // GitLab stores an Issue's body as `description`; the neutral derivation reads `body`. Map it once,
    // here, so every fact derivation stays the one the GitHub composition already uses.
    return { ...issue, body: issue.description, node_id: identity, number: iid, comments, records };
  };
  const readIssueState = async (issueId) => {
    const iid = issueIid(issueId);
    const issue = validateIssue(await api(`/issues/${iid}`), iid);
    if (issue.web_url !== issueId)
      throw authorityConflict(
        "Close tracker state or Issue identity is unproven",
      );
    return { issueId: issue.web_url, state: issue.state.toUpperCase() };
  };
  createTrackerWorkflowCore({
    provider: "gitlab",
    repositoryId,
    readIssue,
    readIssueState,
    providerAuthority: { approvedScope: "final-lf-normalized-body-digest", decomposition: "published-body-graph" },
  });
  const worktrees = () =>
    git("worktree", "list", "--porcelain", "-z")
      .split("\0\0")
      .filter(Boolean)
      .map((block) => {
        const fields = Object.fromEntries(
          block
            .split("\0")
            .filter(Boolean)
            .map((line) => {
              const split = line.indexOf(" ");
              return split < 0
                ? [line, true]
                : [line.slice(0, split), line.slice(split + 1)];
            }),
        );
        return { ...fields, worktree: worktreePath(fields.worktree) };
      });
  const targetRead = (target) => {
    const registered = one(
      worktrees().filter(({ branch }) => branch === `refs/heads/${target}`),
      "Target worktree",
    );
    const head = git("rev-parse", "--verify", `refs/heads/${target}^{commit}`);
    const dirty = command("git", [
      "-C",
      registered.worktree,
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]);
    return {
      state: dirty ? "DIRTY" : "CLEAN",
      ownership: dirty ? "UNOWNED" : "NONE",
      head,
      worktree: registered.worktree,
    };
  };
  const ancestor = (commit, target) => {
    if (!sha.test(commit))
      throw new Error("Invalid Git candidate or Planning Seal");
    try {
      git("merge-base", "--is-ancestor", commit, target);
      return true;
    } catch (error) {
      if (error.status === 1) return false;
      throw error;
    }
  };
  const checkpointRead = (snapshot) => {
    const identity = bindProducerCheckpointOperationIdentity(
      snapshot.handoff.record.checkpointIdentity,
    );
    if (
      identity.repositoryId !== repositoryId ||
      identity.specId !== snapshot.spec.node_id
    )
      throw new Error("Producer checkpoint repository or Spec differs");
    const tx = checkpoints.readCheckpoint(identity);
    if (!tx) return { state: "ABSENT" };
    const receipts = Object.fromEntries(
      tx.progress.map(({ stage, receipt }) => [stage, receipt]),
    );
    return {
      ...identity,
      state: tx.state,
      transactionIdentity: tx.transactionId,
      planningSeal: identity.bindings.planningSeal,
      classification: identity.bindings.classification,
      approvedScopeHash: identity.bindings.approvedScopeIdentity,
      firstUnsatisfiedStage: tx.nextStage,
      handoffIdentity: receipts["handoff.completed"]?.handoffIdentity,
      stageReceipts: {
        planningSealReadBack: receipts["planning_seal.read_back"],
        publicationReadBack: receipts["publication.read_back"],
        decompositionReadBack: receipts["decomposition.read_back"],
        readyStateReadBack: receipts["ready_state.read_back"],
      },
    };
  };
  const trackerRead = async (request) => {
    const spec = await readIssue(request.specId);
    // GitLab may strip a description's final LF, so the approved publication, handoff and decomposition
    // are matched by either exact digest of the same bytes. The producer's approved scope hash is never
    // rewritten here: the record's own hash stays the Run's approved scope.
    const approvedBody = (body) => {
      const values = [bodyDigest(body)];
      if (!body.endsWith("\n")) values.push(bodyDigest(`${body}\n`));
      return values;
    };
    const specDigests = approvedBody(spec.body);
    const approvedScopeMatches = (record) =>
      specDigests.includes(record?.authority?.approvedScopeHash ?? record?.approvedScopeHash);
    const publication = one(
      spec.records.filter(
        ({ record }) =>
          record.kind === "spec_publication" && approvedScopeMatches(record),
      ),
      "Current approved Spec publication",
    );
    let authority = publication.record.authority;
    if (
      authority.specId !== spec.node_id ||
      publication.record.repositoryId !== repositoryId
    )
      throw authorityConflict("Spec publication identity differs");
    const expectedProducer =
      authority.classification === "SINGLE" ? "to-spec" : "to-tickets";
    const handoff = one(
      spec.records.filter(
        ({ record }) =>
          record.kind === "producer_handoff" &&
          approvedScopeMatches(record) &&
          record.producerCommand === expectedProducer,
      ),
      "Current producer handoff",
    );
    const decomposition =
      authority.classification === "MULTI"
        ? one(
            spec.records.filter(
              ({ record }) =>
                record.kind === "decomposition:v1" &&
                record.parent === spec.node_id &&
                approvedScopeMatches(record),
            ),
            "Decomposition publication",
          )
        : null;
    if (decomposition)
      authority = {
        ...authority,
        decompositionIdentity: decomposition.identity,
      };
    const mapping = decomposition?.record.decompositionMapping ?? null;
    const ids =
      authority.classification === "SINGLE"
        ? [spec.node_id]
        : Object.values(mapping ?? {});
    if (ids.length === 0 || new Set(ids).size !== ids.length)
      throw authorityConflict("Decomposition has no unique Issue mapping");
    const issueErrors = new Map();
    const issues = await Promise.all(
      ids.map(async (id) => {
        try {
          return id === spec.node_id ? spec : await readIssue(id);
        } catch (error) {
          issueErrors.set(id, error.message);
          return { node_id: id, state: "unknown", records: [], comments: [] };
        }
      }),
    );
    const blockerEdges = decomposition?.record.blockerEdges ?? [];
    const blockers = new Map();
    for (const issue of issues) {
      // Dependency authority is the published body graph alone. A GitLab Community Edition project has
      // no native blocking relation and no Issue hierarchy, so this composition probes neither and
      // publishes no relation of its own.
      blockers.set(
        issue.node_id,
        blockerEdges
          .filter(({ blocked }) => blocked === issue.node_id)
          .map(({ blocker }) => blocker)
          .sort(),
      );
      if (issueErrors.has(issue.node_id)) continue;
      try {
        if (decomposition) {
          if (
            !approvedBody(issue.body).includes(
              decomposition.record.childBodyDigests?.[issue.node_id],
            )
          )
            throw new Error(
              `Issue ${issue.node_id} contract changed since decomposition`,
            );
          const parentCell = sectionOf(issue.body, "Parent");
          if (![spec.node_id, `${spec.node_id}.`].includes(parentCell))
            throw new Error(`Issue ${issue.node_id} parent differs`);
        }
      } catch (error) {
        issueErrors.set(issue.node_id, error.message);
      }
    }
    return {
      issueErrors,
      spec,
      publication,
      authority,
      handoff,
      decomposition,
      mapping,
      issues,
      blockers,
      blockerEdges,
    };
  };
  const reconciliationRead = async ({
    tracker: snapshot,
    journal,
    request,
  }) => {
    const { authority } = snapshot;
    const operation = deriveRunOperationIdentity({
      repositoryId,
      specId: authority.specId,
      approvedPublicationIdentity: authority.approvedScopeHash,
    });
    const runIdentity = request.runIdentity ?? {
      ...authority,
      runId: operation.key,
    };
    // planningSeal is authority evidence, not a member of the journal Run identity.
    const { planningSeal: _ignoredSeal, ...selectedIdentity } = runIdentity;
    if (request.runIdentity && journal.length === 0)
      journal = store.readEvents(selectedIdentity.runId);
    const target = targetRead(authority.target);
    if (!ancestor(authority.planningSeal, target.head))
      throw new Error(
        "Planning Seal is not reachable from the selected target",
      );
    const taskRefs = Object.fromEntries(
      journal
        .filter(({ type }) => type === "dispatch.recorded")
        .map(({ issueId, taskRef }) => [issueId, taskRef]),
    );
    const nodes = [];
    const contradictions = [];
    const preparedLanes = {};
    const modelInputs = {};
    const modelYields = {};
    const declaration = snapshot.publication.record.preparation;
    const supplied = snapshot.handoff.record.preparation;
    const alreadyStarted = journal.some(
      (event) => event.type === "grant.recorded",
    );
    const reconcileClosureHistory = async (issue, affectedNodes) => {
      if (!alreadyStarted || issue.state !== "open") return;
      try {
        // Tracker history survives disposable projections and also covers Runs completed by older packages.
        const events = await list(
          `/issues/${issue.number}/resource_state_events`,
        );
        if (
          events.some(
            (event) => !event || typeof event.state !== "string",
          )
        )
          throw new Error("Native Issue event history is malformed");
        const closures = events.filter((event) => event.state === "closed");
        if (closures.length === 0) return;
        const publicationTime = Date.parse(
          snapshot.spec.comments.find(
            (comment) => comment.node_id === snapshot.publication.identity,
          )?.created_at,
        );
        if (
          !Number.isFinite(publicationTime) ||
          closures.some(
            (event) =>
              !Number.isSafeInteger(event.id) ||
              !Number.isFinite(Date.parse(event.created_at)),
          )
        ) {
          throw new Error(
            "Native closure history cannot be ordered against the current Spec publication",
          );
        }
        const closed = closures.find(
          (event) => Date.parse(event.created_at) >= publicationTime,
        );
        if (closed)
          contradictions.push({
            code: "completed_run_evidence_changed",
            affectedNodes,
            evidence: [
              `Issue ${issue.node_id} is OPEN after native closure #${closed.id} at ${closed.created_at} under current Spec publication ${snapshot.publication.identity}. Preserve the original Run, Grant, tasks and candidates; reconcile the tracker history before re-entry.`,
            ],
          });
      } catch (error) {
        contradictions.push({
          code: "issue_closure_history_unresolved",
          affectedNodes,
          evidence: [
            `Issue ${issue.node_id} closure history is unproven: ${error.message}`,
          ],
        });
      }
    };
    if (authority.classification === "MULTI")
      await reconcileClosureHistory(
        snapshot.spec,
        snapshot.issues.map((issue) => issue.node_id),
      );
    // The Run Grant is this Run's single approval boundary. The planning owner's handoff approvals stay
    // authoritative and are reused first; a Grant may additionally carry the human's approval of the
    // declared operations that handoff left unapproved, so `/run-issue-workflow` asks the human once at
    // Start instead of returning them to the planning owner. The latest Grant owns the current approval set.
    const currentGrant = journal.findLast((event) => event.type === "grant.recorded");
    const approvals = [...(supplied?.approvals ?? []), ...(currentGrant?.approvals ?? [])];
    let preparation = declaration
      ? assessRunPreparation({
          ...declaration,
          approvals,
          trackerPublication: {
            required: declaration.trackerPublication?.required,
            observed: "READ_WRITE_READBACK",
          },
          preparedSql: supplied?.preparedSql ?? [],
        })
      : undefined;
    if (
      alreadyStarted &&
      preparation?.sql === "PENDING" &&
      preparation.questions.length === 0
    )
      preparation = assessRunPreparation({
        ...declaration,
        sql: [],
        preparedSql: [],
        approvals,
        trackerPublication: {
          required: declaration.trackerPublication?.required,
          observed: "READ_WRITE_READBACK",
        },
      });
    if (
      !declaration &&
      [snapshot.spec, ...snapshot.issues].some((issue) => {
        const section = issue.body
          ?.match(
            /^## Manual prerequisites?\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/mu,
          )?.[1]
          ?.trim();
        return section && declaresManualPrerequisite(section);
      })
    )
      preparation = {
        state: "INCOMPLETE",
        reason:
          "The declared Manual prerequisite needs its planning-owned environment and attestation handoff before Run-ready",
      };
    // The identities a child completion may bind (AC-1). The three the Run always admitted — the
    // selected Spec's approved-scope hash, the current publication identity and, for a Multi-Issue Spec,
    // the decomposition identity — plus the approved-scope identity the completed producer transaction
    // itself bound for that Spec and the published decomposition record's own copy of it. A producer
    // derives that identity from the title, body, classification and ready label together, so it is not
    // the approved body's raw digest and a lane that binds it (the honest producer-derived value) was
    // refused. Both values are read from those two already-validated owners and never from the completion
    // under check, so admission stays non-circular; an identity none of them carries still fails closed.
    const producerCheckpoint = checkpointRead(snapshot);
    const admittedPublications = [
      authority.approvedScopeHash,
      snapshot.publication.identity,
      snapshot.decomposition?.identity,
      producerCheckpoint.approvedScopeHash,
      snapshot.decomposition?.record.approvedScopeIdentity,
    ].filter(Boolean);
    for (const issue of snapshot.issues) {
      try {
        if (snapshot.issueErrors?.has(issue.node_id))
          throw new Error(snapshot.issueErrors.get(issue.node_id));
        if (
          !taskRefs[issue.node_id] &&
          creationUnavailable(journal, issue.node_id)
        )
          throw new Error(
            "MODEL_UNAVAILABLE: native Astra rejection proved no task was submitted; independent Issues retain capacity",
          );
        modelInputs[issue.node_id] = modelDecisionInput({
          issueId: issue.node_id,
          specId: authority.specId,
          approvedScopeHash: authority.approvedScopeHash,
          issueBody: issue.body,
          specBody: snapshot.spec.body,
        });
        await reconcileClosureHistory(issue, [issue.node_id]);
        const sql = declaration?.sql?.find(
          (item) => item.issueId === issue.node_id,
        );
        if (sql) {
          const sqlReadiness = assessRunPreparation({
            requiredActions: [],
            approvals: [],
            trackerPublication: { observed: "READ_WRITE_READBACK" },
            sql: [sql],
            preparedSql: supplied?.preparedSql ?? [],
          });
          if (sqlReadiness.state !== "READY")
            throw new Error(
              "Manual prerequisite artifact, environment or attestation is no longer ready",
            );
          const packet = supplied.preparedSql.find(
            (item) => item.issueId === issue.node_id,
          );
          if (
            !readManualAttestation(
              issue.comments.find(
                (comment) => comment.node_id === packet.attestationIdentity,
              ),
              packet,
            ) ||
            git("cat-file", "-t", packet.candidate) !== "commit" ||
            git("cat-file", "-t", packet.blob) !== "blob" ||
            git(
              "rev-parse",
              "--verify",
              `${packet.candidate}:${packet.artifact}`,
            ) !== packet.blob
          )
            throw new Error(
              "Manual attestation or exact artifact content changed",
            );
          const matches = worktrees().filter(
            (item) =>
              item.worktree === worktreePath(packet.worktree) &&
              item.branch === `refs/heads/${packet.topic}`,
          );
          const registered =
            matches.length === 0 &&
            issue.state === "closed" &&
            ancestor(packet.candidate, target.head)
              ? { HEAD: target.head }
              : one(matches, "Prepared Issue worktree");
          if (
            git(
              "rev-parse",
              "--verify",
              `${registered.HEAD}:${packet.artifact}`,
            ) !== packet.blob ||
            (matches.length &&
              command("git", [
                "-C",
                packet.worktree,
                "hash-object",
                "--",
                packet.artifact,
              ]) !== packet.blob)
          )
            throw new Error(
              "Applied Manual prerequisite artifact changed in the current Issue lane",
            );
          if (!ancestor(packet.candidate, registered.HEAD))
            throw new Error(
              "Prepared candidate is no longer in the Issue lane",
            );
          if (!taskRefs[issue.node_id] && issue.state !== "closed") {
            if (
              registered.HEAD !== packet.candidate ||
              command("git", [
                "-C",
                packet.worktree,
                "status",
                "--porcelain=v1",
              ])
            )
              throw new Error("Prepared Issue lane changed before dispatch");
            preparedLanes[issue.node_id] = packet;
          }
        }

        const {
          lifecycle,
          historicalBlocks,
          adoptedCompletion,
          previousAuthorities,
        } = selectRevisionLifecycle({ snapshot, issue, repositoryId });
        const repairCount = (operationId, record) =>
          readRepairProgress({
            records: issue.records,
            issueId: issue.node_id,
            operationId,
            count: readRepairWaveCount(record),
          });
        for (const previous of previousAuthorities) {
          const checkpoint = checkpointRead({
            ...previous,
            spec: snapshot.spec,
          });
          const handoff = previous.handoff.record;
          const original = previous.publication.record.authority;
          if (
            checkpoint.state !== "COMPLETED" ||
            checkpoint.producerCommand !== "to-tickets" ||
            checkpoint.target !== original.target ||
            checkpoint.planningSeal !== original.planningSeal ||
            checkpoint.approvedScopeHash !== original.approvedScopeHash ||
            checkpoint.classification !== "MULTI" ||
            checkpoint.transactionIdentity !== handoff.transactionIdentity ||
            checkpoint.handoffIdentity !== previous.handoff.identity ||
            !isDeepStrictEqual(handoff.operationReceipt, {
              transactionIdentity: checkpoint.transactionIdentity,
              decompositionReadBack:
                checkpoint.stageReceipts.decompositionReadBack,
              readyStateReadBack: checkpoint.stageReceipts.readyStateReadBack,
            }) ||
            !isDeepStrictEqual(checkpoint.stageReceipts.decompositionReadBack, {
              decompositionIdentity: previous.decomposition.identity,
              decompositionDigest: previous.decomposition.bodySha256,
            })
          ) {
            throw new Error(
              "Previous decomposition checkpoint is incomplete or differs from its handoff",
            );
          }
        }
        if (historicalBlocks.length || adoptedCompletion) {
          // A revision never takes ownership of an older Run's task or unresolved intent.
          for (const runId of store.listRunIds()) {
            const events = store.readEvents(runId);
            const grant = events.findLast(
              (event) => event.type === "grant.recorded",
            );
            if (
              grant?.runIdentity.specId === authority.specId &&
              grant.runIdentity.approvedScopeHash !==
                authority.approvedScopeHash
            ) {
              throw new Error(
                "Previous revision has a Run Grant; reconcile its owning Run before revision continuation",
              );
            }
          }
        }
        if (
          lifecycle.length === 0 &&
          issue.comments.some(({ body }) =>
            /\bimplementation_complete\b/u.test(body),
          )
        ) {
          throw new Error(
            `Issue ${issue.node_id} has unclassified legacy completion evidence; preserve its lane`,
          );
        }
        const latest = lifecycle.at(-1);
        const completed = lifecycle.findLast(
          (item) => item.record.kind === "implementation_complete",
        );
        const closeOnly =
          latest?.record.kind === "implementation_blocked" &&
          ["target_dirty", "merge_conflict", "partial_close"].includes(
            latest.record.reasonCode,
          );
        const completion =
          latest?.record.kind === "implementation_complete" ||
          closeOnly ||
          (latest?.record.failure && completed)
            ? completed
            : null;
        const compactOperationId =
          latest?.record.operationIdentity?.key ??
          deriveExecuteIssueOperationIdentity({
            repositoryId,
            specId: authority.specId,
            approvedPublicationIdentity: authority.approvedScopeHash,
            issueId: issue.node_id,
          }).key;
        const compactCompletion =
          latest?.record.kind === "implementation_complete"
            ? {
                issueId: issue.node_id,
                operationId: compactOperationId,
                candidate: latest.record.candidate,
              }
            : undefined;
        const compactIntegrationRecord = compactCompletion
          ? createIntegrationVerification({
              gitCommonDir,
              operationId: compactOperationId,
              issueId: issue.node_id,
              candidate: compactCompletion.candidate,
            }).read()
          : null;
        const compactIntegrationVerification = compactIntegrationRecord?.current
          ? Object.fromEntries(
              ["state", "issueId", "candidate", "targetHead", "identity"].map(
                (field) => [field, compactIntegrationRecord.current[field]],
              ),
            )
          : undefined;
        const compactObservation =
          !latest ||
          [
            "implementation_progress",
            "implementation_repair_progress",
          ].includes(latest.record.kind)
            ? { issueId: issue.node_id, operationId: compactOperationId }
            : undefined;
        let task = taskRefs[issue.node_id]
          ? await tasks.read(taskRefs[issue.node_id], {
              runId: selectedIdentity.runId,
              ...(compactCompletion ? { completion: compactCompletion } : {}),
              ...(compactObservation
                ? { observation: compactObservation }
                : {}),
              ...(compactIntegrationVerification
                ? { integrationVerification: compactIntegrationVerification }
                : {}),
            })
          : null;
        const originalTaskRef = journal.findLast(
          (event) =>
            event.type === "dispatch.recorded" &&
            event.issueId === issue.node_id,
        )?.taskRef;
        const recoveryIntent = journal.findLast(
          (event) =>
            event.type === "recovery.intent" && event.issueId === issue.node_id,
        );
        const recoveryTransfer =
          recoveryIntent &&
          journal.find(
            (event) =>
              event.type === "recovery.task" &&
              event.requestIdentity === recoveryIntent.requestIdentity,
          );
        const recoveryTask = recoveryTransfer
          ? await tasks.read(recoveryTransfer.taskRef)
          : null;
        const acceptedRecovery =
          recoveryTransfer &&
          recoveryTask?.recoveryRequest?.requestIdentity ===
            recoveryIntent.requestIdentity;
        const maintenanceProof =
          issue.state !== "closed" &&
          acceptedRecovery &&
          recoveryIntent.phase === "MAINTENANCE" &&
          recoveryTask.state === "RESUMABLE" &&
          recoveryTask.recoveryResult?.maintenance
            ? validateMaintenanceResult({
                result: recoveryTask.recoveryResult,
                intent: recoveryIntent,
                installed: installationCacheDirectory
                  ? selectWorkflowVersion({
                      cacheDirectory: installationCacheDirectory,
                    })
                  : null,
              })
            : null;
        const recoveryWriting =
          acceptedRecovery &&
          ["REPAIR", "CONTINUE"].includes(recoveryIntent.phase) &&
          recoveryTask.state === "RUNNING";
        const repair = journal.findLast(
          (event) =>
            event.type === "repair.recorded" && event.issueId === issue.node_id,
        );
        const acceptedRepair =
          repair &&
          repair.candidate === completion?.record.candidate &&
          task?.repairRequest?.requestIdentity === repair.requestIdentity &&
          task.repairRequest.runId === selectedIdentity.runId;
        const repairing =
          (acceptedRepair && task.state === "RUNNING") || recoveryWriting;
        let taskState = "NONE";
        if (task?.state === "RUNNING") taskState = "EXECUTING";
        else if (task?.state === "DISPATCHED") taskState = "DISPATCHED";
        else if (task && task.state !== "RESUMABLE") taskState = "UNKNOWN";
        let completionState = "NONE";
        if (completion) completionState = "COMPLETE";
        else if (latest?.record.kind === "implementation_blocked") completionState = "BLOCKED";
        const node = {
          issueId: issue.node_id,
          blockers: snapshot.blockers.get(issue.node_id),
          trackerState: issue.state.toUpperCase(),
          taskState,
          completionState,
          candidateReachable: false,
          worktreeState: "ABSENT",
        };
        const operationDelivery = journal.filter(
          (event) =>
            event.type === "delivery.observed" &&
            event.issueId === issue.node_id &&
            event.operationId === compactOperationId,
        );
        const latestDeliveryDiagnosis = operationDelivery.findLast(
          (event) => event.stage === "PROGRESS_DIAGNOSED",
        );
        const activeDeliveryDiagnosis =
          latestDeliveryDiagnosis &&
          !operationDelivery.some(
            (event) =>
              event.sequence > latestDeliveryDiagnosis.sequence &&
              event.stage !== "PROGRESS_DIAGNOSED",
          )
            ? latestDeliveryDiagnosis
            : null;
        if (activeDeliveryDiagnosis)
          node.deliveryDiagnosis = activeDeliveryDiagnosis;
        if (task?.outcomeReceipt) node.taskOutcomeReceipt = task.outcomeReceipt;
        if (task?.modelYield && !completion && task.state === "RESUMABLE") {
          const intent = store.readHostTask({
            runId: selectedIdentity.runId,
            issueId: issue.node_id,
          });
          const policy = journal.find(
            (event) => event.type === "grant.recorded",
          )?.modelPolicy;
          if (!policy || !intent?.modelDecision)
            throw new Error(
              "A legacy or adopted task cannot request a policy upgrade",
            );
          const reserved = journal.find(
            (event) =>
              event.type === "model.upgrade" && event.issueId === issue.node_id,
          );
          const substituted = journal.find(
            (event) =>
              event.type === "model.substitution" &&
              event.issueId === issue.node_id,
          );
          const operationIdentity = deriveExecuteIssueOperationIdentity({
            repositoryId,
            specId: authority.specId,
            issueId: issue.node_id,
            approvedPublicationIdentity: authority.approvedScopeHash,
          });
          const evidence = await validateRepairYield({
            evidence: task.modelYield,
            runIdentity: selectedIdentity,
            issueId: issue.node_id,
            recordedRepairWaves: readModelRepairBaseline({
              records: issue.records,
              lifecycle,
              journal,
              issueId: issue.node_id,
              operationId: operationIdentity.key,
            }),
            executionProgress: issue.records.filter(
              (item) => item.record.kind === "implementation_repair_progress",
            ),
            taskRef: taskRefs[issue.node_id],
            task,
            operationIdentity,
            inspectGit: async (value) => {
              const registered = one(
                worktrees().filter(
                  (item) =>
                    item.worktree === worktreePath(value.worktree) &&
                    item.branch === `refs/heads/${value.topic}`,
                ),
                "Yielded Issue worktree",
              );
              if (
                realpathSync.native(
                  resolve(
                    value.worktree,
                    command("git", [
                      "-C",
                      value.worktree,
                      "rev-parse",
                      "--git-common-dir",
                    ]),
                  ),
                ) !== gitCommonDir
              )
                throw new Error("Yielded repository ownership differs");
              return {
                candidate: registered.HEAD,
                topic: value.topic,
                clean: !command("git", [
                  "-C",
                  value.worktree,
                  "status",
                  "--porcelain=v1",
                ]),
                consecutive: value.waves.every((wave) =>
                  ancestor(wave.before, wave.candidate),
                ),
                changedWaves: value.waves.map((wave) =>
                  git("diff", "--name-only", wave.before, wave.candidate, "--")
                    .split(/\r?\n/u)
                    .some((path) =>
                      /\.(?:mjs|cjs|js|jsx|ts|tsx|java|kt|py|go|rs|c|cpp|cs|rb|swift|sql)$/u.test(
                        path,
                      ),
                    ),
                ),
              };
            },
            readVerification: async (reference) => {
              if (!/^[a-f0-9]{64}$/u.test(reference.key))
                throw new Error("Malformed verification cache key");
              const receipt = JSON.parse(
                readFileSync(
                  join(
                    gitCommonDir,
                    "workflow-verification",
                    task.modelYield.operationIdentity.key,
                    `${reference.key}.json`,
                  ),
                  "utf8",
                ),
              );
              if (modelEvidenceDigest(receipt) !== reference.bodySha256)
                throw new Error("Verification receipt digest differs");
              return receipt;
            },
            readReview: async (reference) => {
              if (!/^sha256:[a-f0-9]{64}$/u.test(reference.bodySha256))
                throw new Error("Malformed independent review receipt digest");
              const report = JSON.parse(
                readFileSync(
                  join(
                    gitCommonDir,
                    "workflow-reviews",
                    task.modelYield.operationIdentity.key,
                    `${reference.bodySha256.slice(7)}.json`,
                  ),
                  "utf8",
                ),
              );
              if (
                modelEvidenceDigest(report) !== reference.bodySha256 ||
                report.operationId !== task.modelYield.operationIdentity.key
              )
                throw new Error("Independent review receipt identity differs");
              return report;
            },
          });
          const setting =
            reserved ??
            automaticUpgrade(
              substituted ?? intent.modelDecision,
              evidence.repairWaves,
              false,
            );
          if (
            !setting ||
            (reserved && reserved.yieldIdentity !== evidence.yieldIdentity)
          )
            throw new Error("Automatic upgrade allowance is unavailable");
          modelYields[issue.node_id] = {
            ...evidence,
            setting: { model: setting.model, thinking: setting.thinking },
          };
          node.taskState = "MODEL_YIELDED";
          node.completionState = "NONE";
          node.worktreeState = "PRESENT";
        }
        if (
          completion &&
          task?.closeRequest?.runId === selectedIdentity.runId &&
          (task.closeRequest.issueId === issue.node_id ||
            (authority.classification === "MULTI" &&
              task.closeRequest.issueId === authority.specId))
        )
          node.taskState = "NONE";
        if (repairing) {
          node.taskState = "EXECUTING";
          if (!recoveryWriting) node.completionState = "NONE";
        }
        if (
          acceptedRepair &&
          task.state === "RESUMABLE" &&
          task.snapshot?.turns?.[0]?.status === "completed"
        )
          throw new Error(
            "Conflict repair settled without renewed completion; inspect the original lane's semantic or verification blocker",
          );
        if (task?.state === "UNKNOWN")
          throw new Error(`Issue ${issue.node_id} task state is unknown`);
        if (
          task?.state === "RESUMABLE" &&
          !latest &&
          !modelYields[issue.node_id]
        ) {
          if (task.outcomeReceipt?.disposition === "SUCCEEDED") {
            node.taskState = "EXECUTING"; // The original lane is settled; only its missing publication owner may advance it.
            node.deliveryProgressSource = {
              operationId: compactOperationId,
              completionPublishedAt: null,
              completionEvidenceIdentity: null,
              terminalObservedAt:
                task.outcomeReceipt.progress.terminalObservedAt,
              terminalEvidenceIdentity: task.outcomeReceipt.identity,
              evidenceValidated: false,
              closeAcceptedAt: null,
              closeRequestIdentity: null,
              repositoryCloseAcquiredAt: null,
              targetWriterAcquiredAt: null,
              closeCompletedAt: null,
              closeCompletedOwner: null,
            };
          } else node.taskState = "TRANSIENT_FAILURE";
        }
        if (completion) {
          const record = completion.record;
          let integrationRecord = null;
          readRepairWaveCount(record); // Reject conflicting legacy/current spellings without altering historical receipt bytes.
          if (
            record.issueId !== issue.node_id ||
            record.specId !== authority.specId ||
            record.target !== authority.target ||
            record.standards !== "clean" ||
            record.spec !== "clean" ||
            record.worktreeState !== "clean" ||
            !isCompleteVerificationEvidence(record.verification) ||
            !Array.isArray(record.manualAttestations) ||
            (record.workflowArtifacts !== undefined &&
              !Array.isArray(record.workflowArtifacts))
          )
            throw new Error("Completion contract is incomplete or mismatched");
          const legacy = (kind) =>
            legacyCompletionAllowed({
              records: snapshot.spec.records,
              kind,
              repository: project,
              repositoryId,
              specId: authority.specId,
              target: authority.target,
              completion,
            });
          if (
            record.workflowArtifacts === undefined &&
            !legacy("workflow_artifacts_contract_adopted:v1")
          )
            throw new Error(
              "Completion is outside the exact artifact compatibility frontier",
            );
          if (record.operationIdentity) {
            const publication =
              record.operationIdentity.approvedPublicationIdentity;
            if (
              completion !== adoptedCompletion &&
              !admittedPublications.includes(publication)
            )
              throw new Error(
                "Completion publication is outside current proven authority",
              );
            assertWorkflowOperationIdentity(
              record.operationIdentity,
              deriveExecuteIssueOperationIdentity({
                repositoryId,
                specId: authority.specId,
                approvedPublicationIdentity: publication,
                issueId: issue.node_id,
              }),
            );
          } else if (!legacy("workflow_operation_identity_contract_adopted:v1"))
            throw new Error(
              "Completion is outside the exact operation compatibility frontier",
            );
          if (sql) {
            const packet = supplied.preparedSql.find(
              (item) => item.issueId === issue.node_id,
            );
            const consumed = record.manualAttestations.filter(
              (item) => item.identity === packet.attestationIdentity,
            );
            if (
              consumed.length !== 1 ||
              consumed[0].kind !== "manual_prerequisite_complete:v2" ||
              consumed[0].issue !== issue.node_id ||
              consumed[0].candidate !== packet.candidate ||
              consumed[0].blob !== packet.blob ||
              consumed[0].artifact !== packet.artifact ||
              consumed[0].environmentIdentity !== packet.environmentIdentity ||
              consumed[0].outcome !== packet.outcome
            )
              throw new Error(
                "Completion does not consume the exact current Manual attestation",
              );
          } else if (record.manualAttestations.length)
            throw new Error(
              "Completion consumes undeclared Manual prerequisites",
            );
          if (
            !record.planningSeal ||
            !ancestor(record.planningSeal, record.baseline)
          )
            throw new Error(
              "Completion Planning Seal is not proven at its recorded baseline",
            );
          if (!ancestor(record.baseline, record.candidate))
            throw new Error("Candidate does not contain its recorded baseline");
          const registered = worktrees();
          const exactPath = worktreePath(record.worktree);
          const topicRef = `refs/heads/${record.topic}`;
          const matching = registered.filter(
            ({ worktree, branch }) =>
              worktree === exactPath && branch === topicRef,
          );
          const directory = lstatSync(record.worktree, {
            throwIfNoEntry: false,
          });
          if (directory) {
            if (directory.isSymbolicLink() || !directory.isDirectory())
              throw new Error("Completion worktree ownership differs");
            if (matching.length === 0) {
              // Windows can remove registration/content before the final directory removal fails.
              // This remains PRESENT, so neither Issue nor parent closure can skip physical cleanup.
              if (
                repairing ||
                registered.some(
                  ({ worktree, branch }) =>
                    worktree === exactPath || branch === topicRef,
                ) ||
                readdirSync(record.worktree).length !== 0 ||
                git("rev-parse", "--verify", `${topicRef}^{commit}`) !==
                  record.candidate ||
                !ancestor(record.candidate, target.head)
              )
                throw new Error("Completion worktree ownership differs");
            } else {
              if (
                matching.length !== 1 ||
                realpathSync.native(
                  resolve(
                    record.worktree,
                    command("git", [
                      "-C",
                      record.worktree,
                      "rev-parse",
                      "--git-common-dir",
                    ]),
                  ),
                ) !== gitCommonDir
              )
                throw new Error("Completion worktree ownership differs");
              if (
                !repairing &&
                (matching[0].HEAD !== record.candidate ||
                  command("git", [
                    "-C",
                    record.worktree,
                    "status",
                    "--porcelain=v1",
                  ]))
              )
                throw new Error("Reviewed candidate or clean worktree changed");
            }
            node.worktreeState = "PRESENT";
          } else if (matching.length)
            throw new Error(
              "Completion worktree is missing but still registered",
            );
          node.candidateReachable = ancestor(record.candidate, target.head);
          if (
            adoptedCompletion &&
            (node.worktreeState !== "ABSENT" ||
              !node.candidateReachable ||
              task)
          )
            throw new Error(
              "Adopted completion still has live ownership or is not integrated",
            );
          node.closeAuthorityEvidence = {
            trackerIdentity: `${issue.node_id}:${bodyDigest(issue.body)}`,
            targetHead: target.head,
            candidateCommit: record.candidate,
            completionEvidenceId: completion.identity,
            completionBodySha256: completion.bodySha256,
            worktreeIdentity: bodyDigest(
              JSON.stringify({
                gitCommonDir,
                path: record.worktree,
                topic: record.topic,
              }),
            ),
          };
          const integrationOperationId =
            record.operationIdentity?.key ??
            deriveExecuteIssueOperationIdentity({
              repositoryId,
              specId: authority.specId,
              approvedPublicationIdentity: authority.approvedScopeHash,
              issueId: issue.node_id,
            }).key;
          if (integrationOperationId) {
            const integration = createIntegrationVerification({
              gitCommonDir,
              operationId: integrationOperationId,
              issueId: issue.node_id,
              candidate: record.candidate,
            }).read();
            integrationRecord = integration;
            if (integration) {
              node.integrationVerification = integration.current ?? {
                state: "UNKNOWN",
                issueId: issue.node_id,
                candidate: record.candidate,
                targetHead: target.head,
                identity: bodyDigest(JSON.stringify(integration)),
                results: integration.attempts,
              };
              if (
                issue.state !== "closed" &&
                node.integrationVerification.targetHead !== target.head &&
                node.integrationVerification.state === "PASS"
              ) {
                // Historical PASS authorized any completed cleanup. The close owner must verify the new combination.
                node.integrationRecheck = {
                  previousVerificationIdentity:
                    node.integrationVerification.identity,
                  targetHead: target.head,
                };
              }
              if (
                node.integrationVerification.state !== "PASS" &&
                (issue.state === "closed" || node.worktreeState === "ABSENT")
              )
                throw new Error(
                  "Cleanup or closure contradicts the unresolved integration obligation; retain the closed-Issue owner boundary",
                );
            }
          }
          if (
            [
              "INTEGRATION_FAILED",
              "INTEGRATION_UNKNOWN",
              "HOST_CLEANUP_BLOCKED",
            ].includes(task?.closeResult?.state)
          ) {
            const reported = task.closeResult.integrationVerification;
            const current = integrationRecord?.current;
            const expectedStates = {
              INTEGRATION_FAILED: "FAIL",
              INTEGRATION_UNKNOWN: "UNKNOWN",
              HOST_CLEANUP_BLOCKED: "PASS",
            };
            const expectedState = expectedStates[task.closeResult.state];
            const matches =
              current?.state === expectedState &&
              current.issueId === issue.node_id &&
              current.candidate === record.candidate &&
              current.identity === reported?.identity &&
              (task.closeResult.state === "HOST_CLEANUP_BLOCKED" ||
                current.targetHead === reported?.targetHead);
            if (!matches)
              task = {
                ...task,
                closeResult: undefined,
                closeDiagnosis: {
                  classification: "UNCLASSIFIED",
                  source: "close-issue",
                  reason:
                    "Native close result references missing, stale, or foreign integration evidence",
                  observedDisposition: task.closeResult.state,
                },
              };
          }
          if (record.recovery) {
            const transfer = journal.find(
              (event) =>
                event.type === "recovery.task" &&
                event.requestIdentity === record.recovery.requestIdentity,
            );
            const intent =
              transfer &&
              journal.find(
                (event) =>
                  event.type === "recovery.intent" &&
                  event.requestIdentity === transfer.requestIdentity,
              );
            const previousCompletion = lifecycle.find(
              (item) =>
                item.identity === record.recovery.previousCompletionIdentity,
            );
            node.repairLineage = validateRepairCompletion({
              failure: intent?.failure,
              transfer,
              completion,
              previousCompletion,
              ancestor,
            });
            if (
              readRepairWaveCount(record) <
              repairCount(record.operationIdentity.key, record)
            )
              throw new Error(
                "Replacement completion resets the recorded material repair budget",
              );
          }
          if (
            ["REPAIR", "CONTINUE"].includes(recoveryIntent?.phase) &&
            (record.candidate !== recoveryIntent.failure.candidate ||
              recoveryIntent.phase === "CONTINUE") &&
            !record.recovery
          )
            throw new Error(
              "Replacement completion omits its required repair lineage",
            );
          if (task?.closeResult?.state === "HOST_CLEANUP_BLOCKED") {
            const cleanup = planCloseContinuation({
              task,
              requestIdentity: task.closeRequest?.requestIdentity,
              requestEvidence: {
                runIdentity: selectedIdentity,
                issueId: issue.node_id,
                candidateReachable: node.candidateReachable,
                worktreeState: node.worktreeState,
                authorityEvidence: node.closeAuthorityEvidence,
              },
            });
            if (cleanup.blocked) {
              const pending = createAutomaticHostCleanupPacket({
                result: task.closeResult,
                taskCwd: task.cwd,
                originalTaskRef,
                integrationRecord,
                record,
                target,
                targetName: authority.target,
                issueId: issue.node_id,
                specId: authority.specId,
              });
              if (pending) {
                node.pendingHostCleanup = pending;
              } else {
                contradictions.push({
                  code: "host_cleanup_blocked",
                  reasonCode: cleanup.blocked.reasonCode,
                  affectedNodes: [issue.node_id],
                  evidence: [
                    ...cleanup.blocked.evidence.map(
                      (item) => `${item.code}: ${item.message}`,
                    ),
                    "Automatic close-owner recovery requires exact task, completion, directory, OS failure and executable integration PASS evidence.",
                  ],
                });
              }
            }
          }
        }
        const verificationProof =
          issue.state !== "closed" &&
          completion &&
          acceptedRecovery &&
          ["READBACK", "ENVIRONMENT"].includes(recoveryIntent.phase) &&
          recoveryTask.state === "RESUMABLE" &&
          recoveryTask.recoveryResult?.resolution
            ? validateVerificationResolution({
                result: recoveryTask.recoveryResult,
                intent: recoveryIntent,
                verification:
                  recoveryIntent.failure.verificationSnapshot ??
                  node.integrationVerification,
              })
            : null;
        if (
          verificationProof &&
          task?.closeRequest?.evidence?.verificationRecovery
            ?.requestIdentity === verificationProof.requestIdentity &&
          node.integrationVerification?.state === "PASS"
        )
          node.verificationRecovery = verificationProof;
        if (
          maintenanceProof &&
          task?.closeRequest?.evidence?.maintenanceRecoveryIdentity ===
            recoveryIntent.requestIdentity &&
          node.integrationVerification?.state === "PASS"
        )
          node.maintenanceRecoveryIdentity = recoveryIntent.requestIdentity;
        const renewedCloseActive =
          (node.repairLineage ||
            (maintenanceProof &&
              workflowVersion?.id === maintenanceProof.packageVersion.id &&
              task?.closeRequest?.evidence?.maintenanceRecoveryIdentity ===
                recoveryIntent.requestIdentity) ||
            (verificationProof &&
              task?.closeRequest?.evidence?.verificationRecovery
                ?.requestIdentity === verificationProof.requestIdentity)) &&
          task?.state === "RUNNING" &&
          task.closeRequest?.runId === selectedIdentity.runId &&
          task.closeRequest?.issueId === issue.node_id &&
          task.closeRequest.evidence?.authorityEvidence?.candidateCommit ===
            completion?.record.candidate &&
          task.closeRequest.evidence?.authorityEvidence
            ?.completionEvidenceId === completion?.identity &&
          recoveryTask?.state === "RESUMABLE";
        if (
          issue.state !== "closed" &&
          recoveryTransfer &&
          task?.state !== "RESUMABLE" &&
          !renewedCloseActive
        )
          throw new Error(
            "Original writer is active or uncertain after exclusive recovery transfer",
          );
        if (renewedCloseActive) {
          node.closeActive = true;
          node.taskState = "EXECUTING";
        }
        const conflict = task?.closeResult;
        if (
          completion &&
          !repairing &&
          conflict?.schema === "issue-close-result:v1" &&
          conflict.state === "CONFLICT" &&
          conflict.issueId === issue.node_id &&
          conflict.runId === selectedIdentity.runId &&
          conflict.candidate === completion.record.candidate &&
          conflict.requestIdentity === task.closeRequest?.requestIdentity &&
          conflict.targetRestored === true
        ) {
          if (
            target.state !== "CLEAN" ||
            !ancestor(conflict.targetHead, target.head)
          )
            throw new Error(
              "Conflict target restoration or current ownership is unproven",
            );
          node.closeConflict = {
            candidate: conflict.candidate,
            targetHead: target.head,
            repairWaves: repairCount(
              completion.record.operationIdentity?.key,
              completion.record,
            ),
          };
        }
        let failure =
          latest?.record.kind === "implementation_blocked"
            ? latest.record.failure
            : null;
        if (
          !failure &&
          latest?.record.kind === "implementation_blocked" &&
          recoveryIntent?.failure.blockedEvidenceIdentity === latest.identity
        )
          failure = recoveryIntent.failure;
        const producerDiagnosis =
          task?.closeDiagnosis ??
          ([
            "completion_publication_unresolved",
            "evidence_validation_unresolved",
          ].includes(activeDeliveryDiagnosis?.blockingPredicate)
            ? {
                classification: "UNCLASSIFIED",
                source: activeDeliveryDiagnosis.owner,
                reason: `Delivery evidence is unchanged after the bounded diagnosis: ${activeDeliveryDiagnosis.blockingPredicate}`,
              }
            : null);
        if (!failure && producerDiagnosis && originalTaskRef && task?.cwd) {
          const record = completion?.record;
          const registered = worktrees().filter(
            (item) => item.worktree === worktreePath(task.cwd),
          );
          if (
            record &&
            worktreePath(task.cwd) !== worktreePath(record.worktree)
          ) {
            throw new Error(
              "Diagnosed evidence producer differs from the completion worktree owner",
            );
          }
          if (
            !record &&
            (registered.length !== 1 ||
              realpathSync.native(
                resolve(
                  task.cwd,
                  command("git", [
                    "-C",
                    task.cwd,
                    "rev-parse",
                    "--git-common-dir",
                  ]),
                ),
              ) !== gitCommonDir)
          ) {
            throw new Error(
              "Diagnosed evidence producer has no exact owned worktree",
            );
          }
          const candidate = record?.candidate ?? registered[0].HEAD;
          const topic =
            record?.topic ??
            registered[0].branch?.replace(/^refs\/heads\//u, "") ??
            "DETACHED";
          failure = bindTechnicalFailure({
            runId: selectedIdentity.runId,
            issueId: issue.node_id,
            operationId: compactOperationId,
            candidate,
            targetHead: target.head,
            worktree: task.cwd,
            topic,
            owningSource: task?.closeDiagnosis
              ? "skills/engineering/close-issue/SKILL.md"
              : "skills/engineering/execute-issue/SKILL.md",
            command: task?.closeDiagnosis
              ? ["close-issue", String(issue.node_id)]
              : [
                  "execute-issue",
                  String(issue.node_id),
                  "publish",
                  "implementation_complete",
                ],
            observedResult: producerDiagnosis.reason,
            blockedEvidenceIdentity:
              task?.closeDiagnosis?.observedDisposition ??
              activeDeliveryDiagnosis?.evidenceIdentity ??
              null,
            completionIdentity: completion?.identity ?? null,
            completionBodySha256: completion?.bodySha256 ?? null,
            ownerTaskRef: originalTaskRef,
            repairWaveCount: repairCount(compactOperationId, record),
            diagnosis: producerDiagnosis,
          });
          node.worktreeState = "PRESENT";
        }
        if (
          !failure &&
          latest?.record.kind === "implementation_blocked" &&
          (!completion || !closeOnly) &&
          originalTaskRef &&
          task?.cwd
        ) {
          const registered = worktrees().filter(
            (item) => item.worktree === worktreePath(task.cwd),
          );
          if (
            registered.length !== 1 ||
            realpathSync.native(
              resolve(
                task.cwd,
                command("git", [
                  "-C",
                  task.cwd,
                  "rev-parse",
                  "--git-common-dir",
                ]),
              ),
            ) !== gitCommonDir
          )
            throw new Error(
              "Blocked execution has no exact owned worktree for diagnosis",
            );
          failure = bindTechnicalFailure({
            runId: selectedIdentity.runId,
            issueId: issue.node_id,
            operationId:
              latest.record.operationIdentity?.key ??
              deriveExecuteIssueOperationIdentity({
                repositoryId,
                specId: authority.specId,
                approvedPublicationIdentity: authority.approvedScopeHash,
                issueId: issue.node_id,
              }).key,
            candidate: registered[0].HEAD,
            targetHead: target.head,
            worktree: task.cwd,
            topic:
              registered[0].branch?.replace(/^refs\/heads\//u, "") ??
              "DETACHED",
            owningSource:
              latest.record.owningSource ??
              "skills/engineering/execute-issue/SKILL.md",
            command: latest.record.command ?? [
              "execute-issue",
              String(issue.node_id),
            ],
            observedResult:
              latest.record.reason ??
              latest.record.reasonCode ??
              "Execution reported a blocked outcome requiring diagnosis",
            blockedEvidenceIdentity: latest.identity,
            completionIdentity: completion?.identity ?? null,
            completionBodySha256: completion?.bodySha256 ?? null,
            ownerTaskRef: originalTaskRef,
            repairWaveCount: repairCount(
              latest.record.operationIdentity?.key,
              latest.record,
            ),
          });
          node.worktreeState = "PRESENT";
        }
        if (
          completion &&
          ((node.integrationVerification &&
            node.integrationVerification.state !== "PASS") ||
            node.closeConflict)
        ) {
          const record = completion.record;
          const verification = node.integrationVerification;
          const failedCheck = verification?.results?.find(
            (item) => item.state !== "PASS",
          );
          failure = bindTechnicalFailure({
            runId: selectedIdentity.runId,
            issueId: issue.node_id,
            operationId:
              record.operationIdentity?.key ??
              deriveExecuteIssueOperationIdentity({
                repositoryId,
                specId: authority.specId,
                approvedPublicationIdentity: authority.approvedScopeHash,
                issueId: issue.node_id,
              }).key,
            candidate: record.candidate,
            targetHead: verification?.targetHead ?? target.head,
            worktree: record.worktree,
            topic: record.topic,
            owningSource:
              "skills/engineering/close-issue/references/executable-closeout.md",
            command: failedCheck?.command ?? ["git", "merge", record.candidate],
            observedResult:
              failedCheck?.evidence ??
              (verification
                ? "Integration outcome unknown"
                : "Merge conflict; target restoration verified"),
            verificationIdentity: verification?.identity ?? null,
            completionIdentity: completion.identity,
            completionBodySha256: completion.bodySha256,
            ownerTaskRef: originalTaskRef,
            repairWaveCount: repairCount(record.operationIdentity?.key, record),
            verificationSnapshot: verification ?? null,
            maintenanceEvaluation:
              task?.closeRequest?.evidence?.maintenanceRecoveryIdentity ?? null,
            verificationEvaluation:
              task?.closeRequest?.evidence?.verificationRecovery
                ?.requestIdentity ?? null,
          });
        }
        if (renewedCloseActive) failure = null; // Let the legitimate close owner settle before consuming its next outcome.
        if (failure && issue.state !== "closed") {
          failure = bindTechnicalFailure({
            ...failure,
            repairWaveCount: repairCount(failure.operationId, failure),
          });
          if (
            recoveryIntent?.failure.identity === failure.identity &&
            recoveryIntent.failure.diagnosis
          ) {
            failure = bindTechnicalFailure({
              ...failure,
              diagnosis: recoveryIntent.failure.diagnosis,
            });
          }
          if (
            failure.runId !== selectedIdentity.runId ||
            failure.issueId !== issue.node_id ||
            !sameRecoveryTask(failure.ownerTaskRef, originalTaskRef)
          )
            throw new Error(
              "Technical failure is foreign to this Run or original task",
            );
          if (
            recoveryIntent?.failure.identity === failure.identity &&
            acceptedRecovery &&
            recoveryTask.state === "RESUMABLE"
          ) {
            const result = recoveryTask.recoveryResult;
            if (
              result &&
              (result.requestIdentity !== recoveryIntent.requestIdentity ||
                result.failureIdentity !== failure.identity)
            )
              throw new Error(
                "Recovery response differs from the exact failure request",
              );
            if (
              !completion &&
              ["READBACK", "ENVIRONMENT"].includes(recoveryIntent.phase) &&
              result?.resolution
            ) {
              const executionReady = validateExecutionResolution({
                failure,
                resolution: result.resolution,
              });
              failure = bindTechnicalFailure({
                ...failure,
                diagnosis: { ...failure.diagnosis, executionReady },
              });
            } else if (verificationProof) {
              node.verificationRecovery = verificationProof;
              delete node.integrationVerification; // The durable obligation remains unresolved until its close owner verifies it.
              failure = null;
            } else if (
              ["DIAGNOSE", "READBACK", "ENVIRONMENT"].includes(
                recoveryIntent.phase,
              ) &&
              result?.diagnosis
            )
              failure = bindTechnicalFailure({
                ...failure,
                diagnosis: {
                  ...result.diagnosis,
                  ...(recoveryIntent.phase === "READBACK"
                    ? { readBackAttempted: true }
                    : {}),
                  ...(recoveryIntent.phase === "ENVIRONMENT"
                    ? { remediationAttempted: true }
                    : {}),
                },
              });
            else if (["REPAIR", "CONTINUE"].includes(recoveryIntent.phase))
              throw new Error(
                "Repair settled without a verified replacement completion; inspect its owned evidence",
              );
            else if (
              recoveryIntent.phase === "MAINTENANCE" &&
              result?.maintenance
            ) {
              const proof = maintenanceProof;
              if (workflowVersion?.id === proof.packageVersion.id) {
                node.maintenanceRecoveryIdentity = recoveryIntent.requestIdentity;
                delete node.integrationVerification;
                failure = null;
              } else {
                contradictions.push({
                  code: "workflow_runtime_reentry_required",
                  reasonCode: "workflow_runtime_reentry_required",
                  affectedNodes: [issue.node_id],
                  evidence: [
                    "Verified maintenance installation requires the installed entry to freshly reconcile this same Run with the proven package.",
                  ],
                });
              }
            } else if (!result)
              throw new Error(
                "Recovery task settled without its diagnosis result; preserve the task and evidence",
              );
          }
          if (
            failure?.diagnosis?.classification === "WORKFLOW_DEFECT" &&
            failure.diagnosis.scopeCompatible === true
          ) {
            const source = failure.diagnosis.maintenance?.sourceRepository;
            if (
              !source ||
              !workflowVersion?.sourceRepository ||
              realpathSync.native(source) !==
                realpathSync.native(workflowVersion.sourceRepository)
            )
              throw new Error(
                "Maintenance canonical source is not proven against the affected governing package",
              );
            if (
              !journal.some(
                (event) =>
                  event.type === "recovery.intent" &&
                  event.phase === "MAINTENANCE" &&
                  event.failure.identity === failure.identity,
              )
            ) {
              const maintenance = await readMaintenanceProgress({
                scope: failure.diagnosis.maintenance,
                journal,
                readTask: (ref) => tasks.read(ref),
                readInstalled: (recordedVersion) =>
                  installationCacheDirectory
                    ? selectWorkflowVersion({
                        cacheDirectory: installationCacheDirectory,
                        recordedVersion,
                      })
                    : null,
              });
              failure = bindTechnicalFailure({
                ...failure,
                diagnosis: { ...failure.diagnosis, maintenance },
              });
            }
          }
          if (failure) node.recovery = failure;
          if (failure && producerDiagnosis && task?.state === "RESUMABLE")
            node.taskState = "NONE";
          delete node.closeConflict;
          const pending =
            failure &&
            recoveryIntent?.failure.identity === failure.identity &&
            (recoveryTask?.state === "RUNNING" ||
              (!recoveryTransfer && task?.state === "RUNNING"));
          if (pending) {
            node.recoveryActive = true;
            node.taskState = "EXECUTING";
            taskRefs[issue.node_id] =
              recoveryTransfer?.taskRef ?? originalTaskRef;
          }
        }
        if (completion && originalTaskRef) {
          const receipt = task?.outcomeReceipt;
          const terminalReceipt =
            receipt?.disposition === "SUCCEEDED" &&
            receipt.candidate === completion.record.candidate
              ? receipt
              : null;
          if (
            task?.closeResult?.state === "CLOSED" &&
            task.closeRequest?.evidence?.authorityEvidence?.candidateCommit !==
              completion.record.candidate
          ) {
            throw new Error(
              "Successful close outcome request is no longer current for the completion candidate",
            );
          }
          const closeTimeline =
            task?.closeResult?.state === "CLOSED"
              ? task.closeResult.deliveryProgress
              : undefined;
          node.deliveryProgressSource = {
            operationId: compactOperationId,
            completionPublishedAt: completion.createdAt,
            completionEvidenceIdentity: completion.identity,
            terminalObservedAt:
              terminalReceipt?.progress.terminalObservedAt ?? null,
            terminalEvidenceIdentity: terminalReceipt?.identity ?? null,
            evidenceValidated: Boolean(terminalReceipt),
            closeAcceptedAt: task?.closeAcceptedAt ?? null,
            closeRequestIdentity: task?.closeRequest?.requestIdentity ?? null,
            repositoryCloseAcquiredAt:
              closeTimeline?.repositoryCloseAcquiredAt ?? null,
            targetWriterAcquiredAt:
              closeTimeline?.targetWriterAcquiredAt ?? null,
            closeCompletedAt: closeTimeline?.closeCompletedAt ?? null,
            closeCompletedOwner: closeTimeline ? "close-issue" : null,
          };
        }
        nodes.push(node);
      } catch (error) {
        nodes.push({
          issueId: issue.node_id,
          blockers: snapshot.blockers.get(issue.node_id),
          trackerState: "UNKNOWN",
          taskState: taskRefs[issue.node_id] ? "UNKNOWN" : "NONE",
          completionState: "NONE",
          candidateReachable: false,
          worktreeState: "UNKNOWN",
        });
        contradictions.push({
          code: "issue_evidence_unresolved",
          affectedNodes: [issue.node_id],
          evidence: [error.message],
        });
        if (
          declaration?.sql?.some((item) => item.issueId === issue.node_id) &&
          !journal.some((event) => event.type === "grant.recorded")
        )
          preparation = { state: "INCOMPLETE", reason: error.message };
      }
    }
    const handoff = normalizeWorkflowHandoff(snapshot);
    return {
      runIdentity: selectedIdentity,
      grant: { runIdentity: selectedIdentity, maxParallel: 3 },
      planningSeal: authority.planningSeal,
      taskRefs,
      preparedLanes,
      modelInputs,
      modelYields,
      runReadyAuthority: {
        schema: "run-ready-handoff-facts:v1",
        authority,
        preparation,
        checkpoint: producerCheckpoint,
        handoff,
        targetState: target.state,
        targetOwnership: target.ownership,
        evidence: [],
        trackerRecordIdentities: snapshot.decomposition
          ? [snapshot.publication.identity, snapshot.decomposition.identity]
          : [snapshot.publication.identity],
        decompositionIdentity: authority.decompositionIdentity,
        ...(snapshot.decomposition
          ? {
              decompositionDigest: snapshot.decomposition.bodySha256,
              decompositionMapping: snapshot.mapping,
              blockerEdges: snapshot.blockerEdges,
              readyFrontier: snapshot.decomposition.record.readyFrontier,
            }
          : {}),
      },
      facts: {
        schema: "dag-run-facts:v1",
        run: {
          ...selectedIdentity,
          reconciled: true,
          trackerAvailable: true,
          targetState: target.state,
          targetHead: target.head,
          closeWriterRunId: null,
          closeWriterState: "ABSENT",
          parentTrackerState: snapshot.spec.state.toUpperCase(),
          parentTrackerIdentity: snapshot.spec.node_id,
        },
        nodes,
        contradictions,
      },
    };
  };
  const readCleanupRuns = async () => {
    const evidence = [];
    for (const runId of store.listRunIds()) {
      const row = {
        runId,
        specId: `unknown:${runId}`,
        state: "UNKNOWN",
        terminalAt: null,
        engineLock: "UNKNOWN",
        activeTasks: "UNKNOWN",
      };
      try {
        const journal = store.readEvents(runId);
        const grant = journal.findLast(({ type }) => type === "grant.recorded");
        if (!grant) {
          evidence.push(row);
          continue;
        }
        row.specId = grant.runIdentity.specId;
        row.engineLock =
          store.readWriterLock(runId) === null ? "RELEASED" : "HELD";
        // The projection is only a cheap candidate filter; it never proves terminal state.
        if (
          !["SUCCEEDED", "STOPPED"].includes(store.readStatus(runId)?.run.state)
        ) {
          evidence.push(row);
          continue;
        }
        const request = { specId: row.specId, runIdentity: grant.runIdentity };
        const snapshot = await trackerRead(request);
        if (
          snapshot.authority.approvedScopeHash !==
          grant.runIdentity.approvedScopeHash
        ) {
          evidence.push(row);
          continue;
        }
        const current = await reconciliationRead({
          tracker: snapshot,
          journal,
          request,
        });
        const states = await Promise.all(
          Object.values(current.taskRefs).map((ref) => tasks.read(ref)),
        );
        const unresolvedIntent = snapshot.issues.some(
          (issue) =>
            !current.taskRefs[issue.node_id] &&
            store.readHostTask({ runId, issueId: issue.node_id }),
        );
        row.activeTasks = "UNKNOWN";
        if (!unresolvedIntent && states.some(({ state }) => state === "RUNNING")) row.activeTasks = "PRESENT";
        else if (!unresolvedIntent && states.every(({ state }) => state === "RESUMABLE")) row.activeTasks = "ABSENT";
        row.state = reduceRun({ ...current.facts, journal }).run.state;
        const completedTimes = states.map(
          ({ snapshot: task }) => task?.turns?.[0]?.completedAt,
        );
        if (row.state === "SUCCEEDED") {
          const times = [snapshot.spec, ...snapshot.issues].map(
            ({ closed_at }) => Date.parse(closed_at),
          );
          if (times.every(Number.isFinite))
            row.terminalAt = new Date(Math.max(...times)).toISOString();
        } else if (
          row.state === "STOPPED" &&
          completedTimes.every((time) => Number.isFinite(time))
        ) {
          const stop = journal.findLast(
            ({ type, command }) =>
              type === "control.revised" && command === "STOP",
          );
          if (stop)
            row.terminalAt = new Date(
              Math.max(
                Date.parse(stop.at),
                ...completedTimes.map((time) =>
                  time < 1e12 ? time * 1000 : time,
                ),
              ),
            ).toISOString();
        }
      } catch {
        /* Unreadable owning evidence is retained as UNKNOWN, never an empty inventory. */
      }
      evidence.push(row);
    }
    return evidence;
  };
  return {
    async readModelInputs(specId) {
      const snapshot = await trackerRead({ specId });
      if (snapshot.issueErrors.size)
        throw authorityConflict([...snapshot.issueErrors.values()].join("; "));
      return {
        authority: snapshot.authority,
        inputs: snapshot.issues.map((issue) =>
          modelDecisionInput({
            issueId: issue.node_id,
            specId: snapshot.authority.specId,
            approvedScopeHash: snapshot.authority.approvedScopeHash,
            issueBody: issue.body,
            specBody: snapshot.spec.body,
          }),
        ),
      };
    },
    // The active Codex task supplies its freshly read human handoff/control; this source owns
    // tracker, checkpoint, Git and journal evidence and performs no task or Run mutation.
    async readBootstrapHandoff({ specId, human, control }) {
      const request = { specId };
      const snapshot = await trackerRead(request);
      const current = await reconciliationRead({
        request,
        tracker: snapshot,
        journal: [],
      });
      const node = current.facts.nodes.find(
        (item) => item.issueId === human?.issueId,
      );
      const hasRunGrant = store
        .listRunIds()
        .some((id) =>
          store
            .readEvents(id)
            .some(
              (event) =>
                event.type === "grant.recorded" &&
                event.runIdentity.specId === snapshot.spec.node_id,
            ),
        );
      return assessBootstrapHandoff({
        human,
        control,
        repositoryId,
        authority: snapshot.authority,
        node,
        hasRunGrant,
        readiness: reduceRunReadyHandoff(current.runReadyAuthority),
        approvals: snapshot.handoff.record.preparation?.approvals,
        blockers: node?.blockers.map((id) =>
          current.facts.nodes.find((item) => item.issueId === id),
        ),
        contradictions: current.facts.contradictions,
      });
    },
    gitCommonDir,
    issueIid,
    readIssue,
    readIssueState,
    targetRead,
    readCleanupRuns,
    metrics: () => ({ commandCalls }),
    sources: {
      repository: { readIdentity: async () => repositoryId },
      tracker: { read: trackerRead },
      reconciliation: { read: reconciliationRead },
      target: {
        read: async ({ current }) => targetRead(current.runIdentity.target),
      },
      checkpoint: { read: async ({ tracker }) => checkpointRead(tracker) },
      handoff: {
        read: async ({ tracker }) => normalizeWorkflowHandoff(tracker),
      },
      writer: {
        readHealth: async ({ current, leaseKind, owner }) =>
          store.readLeaseHealth({
            leaseKind,
            target: current.runIdentity.target,
            owner,
          }),
      },
      selector: {
        listNonTerminalRuns: async () =>
          store.listRunIds().flatMap((runId) => {
            const status = store.readStatus(runId);
            if (["SUCCEEDED", "STOPPED"].includes(status?.run.state)) return [];
            const grant = store
              .readEvents(runId)
              .findLast(({ type }) => type === "grant.recorded");
            return grant ? [{ runIdentity: grant.runIdentity }] : [];
          }),
      },
    },
  };
}
