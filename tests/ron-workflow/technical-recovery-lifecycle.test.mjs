import assert from "node:assert/strict";
import test from "node:test";
import childProcess, { execFileSync } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { renderWorkflowRecord, bodyDigest } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-records.mjs";
import { bindProducerCheckpointOperationIdentity, deriveExecuteIssueOperationIdentity } from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";

for (const recoveryKind of ["issue", "maintenance", "environment", "readback", "execution_environment"]) test(`packaged ${recoveryKind} recovery carries real failed integration to renewed close`, async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "technical-recovery-")));
  const repository = join(root, "repository"), lane = join(root, "issue"), packageRoot = join(root, "package");
  const maintenanceLane = join(root, "maintenance"), cacheDirectory = join(root, "packages");
  const originalExec = childProcess.execFileSync;
  const gitAt = (cwd, ...args) => originalExec("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const git = (...args) => gitAt(repository, ...args);
  try {
    for (const folder of ["personal/run-issue-workflow/scripts", "engineering/execute-issue/scripts", "engineering/close-issue/scripts"]) {
      cpSync(resolve("skills", folder), join(packageRoot, "skills", folder), { recursive: true });
    }
    const moduleAt = name => import(pathToFileURL(join(packageRoot, "skills", name)).href);
    const { createRunStore } = await moduleAt("personal/run-issue-workflow/scripts/run-store.mjs");
    const { createWorkflowControlStore } = await moduleAt("personal/run-issue-workflow/scripts/workflow-control-store.mjs");
    const { createGitHubWorkflowSources } = await moduleAt("personal/run-issue-workflow/scripts/github-workflow-sources.mjs");
    const { createCodexWorkflowTasks } = await moduleAt("personal/run-issue-workflow/scripts/codex-workflow-tasks.mjs");
    const { createCoordinator } = await moduleAt("personal/run-issue-workflow/scripts/run-coordinator.mjs");
    const { withCloseIssueLeases } = await moduleAt("engineering/close-issue/scripts/close-lease.mjs");
    const { mergeCandidate, verifyIntegratedCandidate } = await moduleAt("engineering/close-issue/scripts/merge-candidate.mjs");
    const { createIntegrationVerification } = await moduleAt("engineering/execute-issue/scripts/verification-cache.mjs");
    const { WINDOWS_GRADLE_LOOPBACK_FINGERPRINT } = await moduleAt("personal/run-issue-workflow/scripts/recovery-evidence.mjs");
    const { installWorkflow, selectWorkflowVersion } = await moduleAt("personal/run-issue-workflow/scripts/workflow-installation.mjs");
    const policyPath = "skills/personal/run-issue-workflow/scripts/fixture-policy.json";
    let installed;
    const install = candidate => installWorkflow({ sourceRepository: packageRoot, sourceCommit: candidate, cacheDirectory, skillDirectory: join(root, "entry") });
    if (recoveryKind === "maintenance") {
      originalExec("git", ["init", "-b", "main", packageRoot], { stdio: "ignore" });
      gitAt(packageRoot, "config", "user.name", "Fixture"); gitAt(packageRoot, "config", "user.email", "fixture@example.invalid");
      writeFileSync(join(packageRoot, "skills/personal/run-issue-workflow/SKILL.md"), "Fixture workflow source\n");
      mkdirSync(join(packageRoot, "skills/personal/run-issue-workflow/references"), { recursive: true });
      cpSync(resolve("skills/personal/run-issue-workflow/references/codex-host-driver.md"), join(packageRoot, "skills/personal/run-issue-workflow/references/codex-host-driver.md"));
      writeFileSync(join(packageRoot, policyPath), JSON.stringify({ expected: "fixed" }));
      gitAt(packageRoot, "add", "skills"); gitAt(packageRoot, "commit", "-m", "Governing package with faulty check");
      installed = install(gitAt(packageRoot, "rev-parse", "HEAD"));
    }
    const retainedVersion = installed?.version;
    const maintenanceScope = { repositoryId: "github:example/workflow", sourceRepository: packageRoot, target: "main", approvedScopeHash: "fixture-scoped-policy-fix", authority: "fixture-human-maintenance-approval", installationAuthority: "fixture-exact-installation-approval", operationId: "fixture-maintenance-operation", repairWaveCount: 0 };
    originalExec("git", ["init", "-b", "main", repository], { stdio: "ignore" });
    git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    git("remote", "add", "origin", "https://github.com/example/repo.git");
    writeFileSync(join(repository, "behavior.txt"), "base"); git("add", "."); git("commit", "-m", "baseline");
    const baseline = git("rev-parse", "HEAD");
    git("worktree", "add", "-b", "issue", lane, "main");
    writeFileSync(join(lane, "behavior.txt"), "broken"); gitAt(lane, "commit", "-am", "original Issue candidate");
    const oldCandidate = gitAt(lane, "rev-parse", "HEAD");
    const common = join(repository, ".git"), store = createRunStore({ gitCommonDir: common });
    const body = `Settled requirements: behavior is ${recoveryKind === "issue" ? "fixed" : "broken"}`;
    const authority = { specId: "I_1", target: "main", planningSeal: baseline, classification: "SINGLE", approvedScopeHash: bodyDigest(body), decompositionIdentity: null };
    const identity = bindProducerCheckpointOperationIdentity({ repositoryId: "github:example/repo", specId: "I_1", producerCommand: "to-spec", profileVersion: "v2", target: "main", baseline,
      bindings: { approvedScopeIdentity: authority.approvedScopeHash, classification: "SINGLE", planningSeal: baseline } });
    const control = createWorkflowControlStore({ gitCommonDir: common });
    const transaction = control.createCheckpoint(identity);
    for (const [stage, receipt] of [["planning_seal.read_back", { planningSeal: baseline, state: "reused" }], ["publication.read_back", { publicationIdentity: "IC_pub", trackerIdentity: "I_1" }], ["handoff.completed", { handoffIdentity: "IC_hand" }]]) control.advanceCheckpoint({ identity, stage, receipt });
    const operationIdentity = deriveExecuteIssueOperationIdentity({ repositoryId: "github:example/repo", specId: "I_1", issueId: "I_1", approvedPublicationIdentity: authority.approvedScopeHash });
    const comment = (id, record) => ({ node_id: id, author_association: "OWNER", body: renderWorkflowRecord(record) });
    const completion = { kind: "implementation_complete", issueId: "I_1", specId: "I_1", target: "main", targetWorktree: repository, topic: "issue", worktree: lane,
      baseline, candidate: oldCandidate, planningSeal: baseline, operationIdentity, repairWaveCount: 3, workflowArtifacts: [],
      standards: "clean", spec: "clean", worktreeState: "clean", manualAttestations: [], verification: [{ command: "original unit fixture", result: "PASS" }] };
    const legacyCompletion = { ...completion, repairWaves: completion.repairWaveCount };
    delete legacyCompletion.repairWaveCount;
    const oldCompletion = comment("IC_done", legacyCompletion);
    const initialExecution = recoveryKind === "execution_environment";
    const firstSuccessfulClose = initialExecution ? 1 : 2;
    const fixture = { node_id: "I_1", number: 1, state: "open", body, comments: [
      comment("IC_pub", { kind: "spec_publication", repositoryId: "github:example/repo", authority }),
      comment("IC_hand", { kind: "producer_handoff", ...authority, producerCommand: "to-spec", checkpointIdentity: identity,
        transactionIdentity: transaction.transactionId, publicationIdentity: "IC_pub", trackerIdentity: "I_1", recordIdentities: ["IC_pub"] }), oldCompletion] };
    childProcess.execFileSync = (name, args, options) => {
      if (name !== "gh") return originalExec(name, args, options);
      const route = args[1];
      return JSON.stringify(route === "graphql" ? { data: { node: { id: "I_1", number: 1, repository: { nameWithOwner: "example/repo" } } } }
        : route.includes("comments") ? [fixture.comments] : /events\?|blocked_by/u.test(route) ? [[]] : [fixture]);
    };
    syncBuiltinESMExports();
    const originalRef = { threadId: "original", hostId: "local" }, repairRef = { threadId: "repair", hostId: "local" };
    const histories = new Map([["original", []]]);
    let closeMessages = 0, forks = 0, repairs = 0, maintenanceCreates = 0, runIdentity, repairRecord, activeOriginal = false;
    let environmentInput = "unavailable", observedOutcome;
    const argv = recoveryKind === "maintenance" ? [process.execPath, "--input-type=module", "-e", `import {readFileSync} from "node:fs"; import assert from "node:assert/strict"; import {selectWorkflowVersion} from ${JSON.stringify(pathToFileURL(join(packageRoot, "skills/personal/run-issue-workflow/scripts/workflow-installation.mjs")).href)}; const selected=selectWorkflowVersion({cacheDirectory:${JSON.stringify(cacheDirectory)}}); assert.equal(selected.state,"AVAILABLE"); assert.equal(readFileSync("behavior.txt","utf8"),JSON.parse(readFileSync(selected.root+"/${policyPath}","utf8")).expected);`] : [process.execPath, "-e", "require('node:assert/strict').equal(require('node:fs').readFileSync('behavior.txt','utf8'),'fixed')"];
    if (["environment", "readback", "execution_environment"].includes(recoveryKind)) argv[2] = argv[2].replace("'fixed'", "'broken'");
    if (initialExecution) fixture.comments[2] = comment("IC_blocked", { kind: "implementation_blocked", issueId: "I_1", specId: "I_1", operationIdentity, repairWaves: 3,
      reasonCode: "technical_failure", reason: WINDOWS_GRADLE_LOOPBACK_FINGERPRINT, owningSource: "fixture native process", command: argv });
    const checks = [{ command: argv, environment: { node: process.version }, readExternalInputs: async () => recoveryKind === "maintenance" ? { packageVersion: selectWorkflowVersion({ cacheDirectory }).version.id }
      : recoveryKind === "environment" ? { environmentInput } : {} }];
    if (["environment", "readback"].includes(recoveryKind)) checks[0].run = async command => {
      if (recoveryKind === "environment" && environmentInput === "unavailable") return { exitCode: 1, evidence: WINDOWS_GRADLE_LOOPBACK_FINGERPRINT };
      originalExec(command[0], command.slice(1), { cwd: repository });
      if (recoveryKind === "readback" && !observedOutcome) { observedOutcome = { exitCode: 0, source: "fixture native process", evidence: "exact recorded process exited 0" }; throw new Error("native result lost"); }
      return { exitCode: 0 };
    };
    const host = { async call(name, args) {
      assert.notEqual(args.threadId, "retired", "recovery never reads, messages or forks the superseded inactive task");
      if (name.endsWith("read_thread")) return { thread: { id: args.threadId, hostId: "local", cwd: args.threadId === "maintenance" ? maintenanceLane : lane, status: { type: activeOriginal && args.threadId === "original" ? "active" : "idle" } }, turns: histories.get(args.threadId) };
      if (name.endsWith("list_threads")) return { threads: forks ? [{ id: "repair", hostId: "local", kind: "codex", cwd: lane }] : [] };
      if (name.endsWith("list_projects")) return { projects: [{ id: "workflow", hostId: "local", path: packageRoot, isGitRepository: true }] };
      if (name.endsWith("create_thread")) {
        maintenanceCreates++; assert.equal(args.target.projectId, "workflow");
        gitAt(packageRoot, "worktree", "add", "-b", "maintenance", maintenanceLane, "main");
        histories.set("maintenance", [{ id: "setup", status: "completed", items: [{ type: "userMessage", content: [{ type: "text", text: args.prompt }] }] }]);
        return { threadId: "maintenance", hostId: "local" };
      }
      if (name.endsWith("fork_thread")) {
        forks++; histories.set("repair", structuredClone(histories.get("original")));
        throw new Error("response lost after exact same-directory fork");
      }
      if (name.endsWith("send_message_to_thread")) {
        const turn = { id: `turn-${histories.get(args.threadId).length}`, status: "completed", items: [{ type: "userMessage", content: [{ type: "text", text: args.prompt }] }] };
        histories.get(args.threadId).unshift(turn);
        const recovery = args.prompt.match(/^Recovery request: (\{.+\})$/mu);
        if (recovery) {
          const request = JSON.parse(recovery[1]);
          assert.equal(args.threadId, request.phase === "MAINTENANCE" ? "maintenance" : "repair", "the original task never performs repair edits");
          const failure = JSON.parse(args.prompt.match(/^Original failure and authority: (\{.+\})$/mu)[1]);
          if (request.phase === "DIAGNOSE") turn.items.push({ type: "agentMessage", phase: "final_answer", text: `Workflow recovery result: ${JSON.stringify({ requestIdentity: request.requestIdentity, failureIdentity: request.failureIdentity,
            diagnosis: recoveryKind === "maintenance" ? { classification: "WORKFLOW_DEFECT", source: policyPath, reason: "The governing check contradicts the settled requirement", scopeCompatible: true, maintenance: maintenanceScope }
              : ["environment", "execution_environment"].includes(recoveryKind) ? { classification: "ENVIRONMENT", source: "fixture native process", reason: WINDOWS_GRADLE_LOOPBACK_FINGERPRINT, fingerprint: WINDOWS_GRADLE_LOOPBACK_FINGERPRINT }
              : recoveryKind === "readback" ? { classification: "OUTCOME_UNKNOWN", source: "fixture native process", reason: "native result lost" }
              : { classification: "ISSUE_DEFECT", source: "behavior.txt", reason: "Concrete test proves settled behavior is broken", scopeCompatible: true } })}` });
          else if (["ENVIRONMENT", "READBACK"].includes(request.phase)) {
            assert.equal(request.wave, null); assert.equal(store.observeRepositoryCloseLease().state, "ABSENT");
            const attempt = failure.verificationSnapshot?.results[0];
            if (request.phase === "ENVIRONMENT") environmentInput = "available";
            const resolution = initialExecution ? { mode: "EXECUTION_READY", candidate: failure.candidate, targetHead: failure.targetHead, command: argv, exitCode: 0, source: "fixture native process", evidence: "bounded initial recovery and exact command succeeded" }
              : { mode: request.phase === "ENVIRONMENT" ? "CHANGED_INPUTS" : "OUTCOME_READ_BACK", attemptIdentity: attempt.identity,
              command: argv, targetHead: failure.targetHead, inputs: { ...attempt.inputs, external: await checks[0].readExternalInputs() },
              source: "fixture native process", evidence: request.phase === "ENVIRONMENT" ? "bounded environment remedy proved available" : observedOutcome.evidence, exitCode: 0 };
            turn.items.push({ type: "agentMessage", phase: "final_answer", text: `Workflow recovery result: ${JSON.stringify({ requestIdentity: request.requestIdentity, failureIdentity: request.failureIdentity, resolution })}` });
            assert.equal(gitAt(lane, "rev-parse", "HEAD"), oldCandidate);
          }
          else if (request.phase === "CONTINUE") {
            assert.equal(initialExecution, true); assert.equal(request.wave, null);
            originalExec(argv[0], argv.slice(1), { cwd: lane });
            repairRecord = { ...completion, repairWaveCount: 3, verification: [{ command: argv.join(" "), argv, result: "PASS" }],
              recovery: { failureIdentity: failure.identity, requestIdentity: request.requestIdentity, taskRef: repairRef, previousCompletionIdentity: null, previousCompletionBodySha256: null } };
            fixture.comments.push(comment("IC_repaired", repairRecord));
          }
          else if (request.phase === "MAINTENANCE") {
            assert.equal(request.wave, 1); assert.equal(store.observeRepositoryCloseLease().state, "ABSENT");
            writeFileSync(join(maintenanceLane, policyPath), JSON.stringify({ expected: "broken" }));
            gitAt(maintenanceLane, "commit", "-am", "Repair scoped governing verification policy");
            const candidate = gitAt(maintenanceLane, "rev-parse", "HEAD");
            const check = [process.execPath, "-e", `require('node:assert/strict').equal(require('./${policyPath}').expected,'broken')`];
            originalExec(check[0], check.slice(1), { cwd: maintenanceLane });
            installed = install(candidate);
            assert.equal(gitAt(packageRoot, "status", "--porcelain"), "", "shared canonical checkout remains unchanged");
            assert.equal(gitAt(lane, "rev-parse", "HEAD"), oldCandidate, "product candidate remains unchanged");
            assert.equal(selectWorkflowVersion({ cacheDirectory, recordedVersion: retainedVersion }).version.id, retainedVersion.id);
            turn.items.push({ type: "agentMessage", phase: "final_answer", text: `Workflow recovery result: ${JSON.stringify({ requestIdentity: request.requestIdentity, failureIdentity: request.failureIdentity,
              maintenance: { repositoryId: maintenanceScope.repositoryId, target: "main", operationId: maintenanceScope.operationId, candidate, packageVersion: installed.version,
                repairWaveCount: 1, standards: "clean", spec: "clean", verification: [{ command: check.join(" "), result: "PASS" }], installation: { authority: maintenanceScope.installationAuthority, packageVersionId: installed.version.id } } })}` });
          } else {
            assert.equal(request.phase, "REPAIR"); assert.equal(request.wave, 5); repairs++;
            assert.equal(store.readEvents(runIdentity.runId).at(-1).type, "recovery.task");
            assert.equal(store.readTargetMutationWriterLock("main"), null);
            assert.equal(store.observeRepositoryCloseLease().state, "ABSENT");
            const capturedTarget = git("rev-parse", "main"); gitAt(lane, "merge", "--no-edit", capturedTarget);
            writeFileSync(join(lane, "behavior.txt"), "fixed"); gitAt(lane, "commit", "-am", "Repair settled Issue behavior");
            originalExec(argv[0], argv.slice(1), { cwd: lane });
            // Reviews are explicit fixture inputs. This test executes Git and verification, not an LLM review.
            repairRecord = { ...completion, baseline: capturedTarget, candidate: gitAt(lane, "rev-parse", "HEAD"), repairWaveCount: 5,
              verification: [{ command: argv.join(" "), argv, result: "PASS" }], recovery: { failureIdentity: failure.identity, requestIdentity: request.requestIdentity, taskRef: repairRef,
                previousCompletionIdentity: "IC_done", previousCompletionBodySha256: bodyDigest(oldCompletion.body) } };
            fixture.comments.push(comment("IC_repaired", repairRecord));
          }
        } else if (args.prompt.includes("Close request identity:")) {
          assert.equal(args.threadId, "original"); closeMessages++;
          const request = JSON.parse(args.prompt.match(/Current close request evidence: (\{.+\})/u)[1]);
          const candidate = request.authorityEvidence.candidateCommit;
          if (closeMessages === firstSuccessfulClose) { activeOriginal = true; assert.deepEqual((await refresh()).facts.contradictions, [], "the original close owner may run after repair settlement"); activeOriginal = false; }
          if (request.verificationRecovery?.resolution.mode === "OUTCOME_READ_BACK") checks[0].readOutcome = async attempt => ({ ...observedOutcome, attemptIdentity: attempt.identity });
          await withCloseIssueLeases({ store, target: "main", repositoryId: "github:example/repo", specId: "I_1", issueId: "I_1", approvedPublicationIdentity: authority.approvedScopeHash }, async leases => {
            mergeCandidate({ leases, targetWorktree: repository, candidate });
            const verification = await verifyIntegratedCandidate({ leases, targetWorktree: repository, candidate, issueId: "I_1", operationId: operationIdentity.key, checks });
            if (verification.state === "PASS") {
              if (existsSync(lane)) git("worktree", "remove", lane);
              if (closeMessages > firstSuccessfulClose) fixture.state = "closed"; // A real partial close: cleanup succeeded but tracker mutation has not.
            }
          });
        }
        throw new Error("response lost after accepted action");
      }
      throw new Error(`Unexpected native call ${name}`);
    } };
    histories.get("original").push({ id: "execution", status: "completed", items: [
      { type: "agentMessage", phase: "final_answer", text: "Implementation fixture settled with its recorded completion." },
    ] });
    const tasks = createCodexWorkflowTasks({ host, store, project: { path: repository, hostId: "local" }, packageRoot, issueNumber: async () => 1, sleep: async () => {}, discoverTasks: async () => [] });
    let owners = createGitHubWorkflowSources({ repository, repositoryName: "example/repo", store, tasks, workflowVersion: installed?.version, installationCacheDirectory: cacheDirectory });
    const refresh = () => owners.sources.tracker.read({ specId: "I_1" }).then(tracker => owners.sources.reconciliation.read({ tracker, journal: runIdentity ? store.readEvents(runIdentity.runId) : [], request: {} }));
    runIdentity = (await refresh()).runIdentity;
    const writer = store.acquireWriter(runIdentity.runId);
    writer.append({ type: "grant.recorded", at: "2026-09-08T00:00:00.000Z", runIdentity, maxParallel: 3 });
    const retiredRef = { threadId: "retired", hostId: "local" };
    writer.append({ type: "dispatch.recorded", at: "2026-09-08T00:00:00.000Z", issueId: "I_1", attempt: 1, taskRef: recoveryKind === "issue" ? retiredRef : originalRef });
    if (recoveryKind === "issue") {
      writer.append({ type: "retry.recorded", at: "2026-09-08T00:00:00.000Z", issueId: "I_1", attempt: 1, priorTaskRef: retiredRef, reason: "Native terminal failure with inactive prior task",
        replacement: { supersedesAttempt: 1, nextTaskRef: originalRef, inactiveEvidence: ["Native read-back: terminal failure and no active turn"] } });
      writer.append({ type: "dispatch.recorded", at: "2026-09-08T00:00:00.000Z", issueId: "I_1", attempt: 2, taskRef: originalRef });
    }
    const retainedDispatches = store.readEvents(runIdentity.runId).filter(event => event.type === "dispatch.recorded");
    writer.release();
    const options = { store, tasks, tracker: owners.sources.tracker, reconcile: args => owners.sources.reconciliation.read(args),
      handoff: { read: async ({ current }) => current.runReadyAuthority }, now: () => "2026-09-08T00:00:00.000Z", sleep: async () => {} };
    const step = () => createCoordinator(options).run({ specId: "I_1", mode: "step" });
    if (recoveryKind === "issue") {
      const retainedBody = fixture.comments[2].body;
      fixture.comments[2].body = renderWorkflowRecord({ ...legacyCompletion, repairWaveCount: 1 });
      assert.match((await refresh()).facts.contradictions[0].evidence[0], /count fields.*conflicting/u);
      fixture.comments[2].body = retainedBody;
    }
    if (!initialExecution) await step();
    if (!initialExecution) assert.equal((await refresh()).facts.nodes[0].integrationVerification.state, recoveryKind === "readback" ? "UNKNOWN" : "FAIL");
    assert.equal(existsSync(lane), true); assert.equal(fixture.state, "open"); assert.equal(git("rev-parse", "HEAD"), initialExecution ? baseline : oldCandidate);
    if (recoveryKind === "issue") {
      const beforeProgress = (await refresh()).facts.nodes[0].recovery;
      assert.deepEqual(beforeProgress.ownerTaskRef, originalRef, "the failure belongs to the current authorized dispatch");
      fixture.comments.push(comment("IC_progress", { kind: "implementation_progress", issueId: "I_1", operationIdentity, repairWaveCount: 4, candidate: oldCandidate }));
      const afterProgress = (await refresh()).facts.nodes[0].recovery;
      assert.equal(afterProgress.repairWaveCount, 4, "owner progress is joined even while the retained completion records an older count");
      assert.equal(afterProgress.identity, beforeProgress.identity, "progress must not discard the failure or task lineage");
    }
    await step(); // Settled handoff, lost fork response, diagnosis.
    const repairStatus = await step(); // Same isolated task, material repair, renewed completion.
    if (initialExecution) await step(); // Successful environment recovery continues execution in the same exclusive task.
    if (recoveryKind === "maintenance") {
      assert.equal(repairs, 0); assert.equal(maintenanceCreates, 1);
      const stopped = await createCoordinator(options).run({ specId: "I_1" });
      assert.equal(stopped.run.state, "BLOCKED", JSON.stringify(stopped));
      assert.equal(stopped.legalActions.length, 0, "completed maintenance cannot spin the accepted recovery action");
      assert.equal(stopped.diagnoses.find(item => item.reasonCode === "workflow_runtime_reentry_required").nextOwner, "installed-entry");
      const newRuntime = await import(pathToFileURL(join(installed.root, "skills/personal/run-issue-workflow/scripts/github-workflow-sources.mjs")).href);
      owners = newRuntime.createGitHubWorkflowSources({ repository, repositoryName: "example/repo", store, tasks, workflowVersion: installed.version, installationCacheDirectory: cacheDirectory });
      assert.ok((await refresh()).facts.nodes[0].maintenanceRecoveryIdentity);
    } else if (recoveryKind === "issue") {
    assert.equal(repairs, 1, JSON.stringify({failures: store.readEvents(runIdentity.runId).filter(e=>e.type === "action.failed"), forks, histories: [...histories.keys()], status: repairStatus.run})); assert.equal(closeMessages, 1);
    assert.equal((await refresh()).facts.nodes[0].repairLineage.previousCandidate, oldCandidate);
    const valid = fixture.comments.at(-1).body;
    fixture.comments.at(-1).body = renderWorkflowRecord({ ...repairRecord, recovery: { ...repairRecord.recovery, taskRef: originalRef } });
    assert.match((await refresh()).facts.contradictions[0].evidence[0], /Repair completion/u);
    fixture.comments.at(-1).body = renderWorkflowRecord({ ...repairRecord, verification: [{ command: "different command", argv: ["skip"], result: "PASS" }] });
    assert.match((await refresh()).facts.contradictions[0].evidence[0], /Repair completion/u);
    fixture.comments.at(-1).body = valid;
    } else if (initialExecution) {
      assert.equal(repairRecord.candidate, oldCandidate); assert.equal(repairRecord.repairWaveCount, 3);
      const resumed = await refresh(); assert.deepEqual(resumed.facts.contradictions, []); assert.ok(resumed.facts.nodes[0].repairLineage);
    } else {
      assert.equal(repairs, 0); assert.equal(maintenanceCreates, 0);
      assert.ok((await refresh()).facts.nodes[0].verificationRecovery);
      assert.notEqual(createIntegrationVerification({ gitCommonDir: common, operationId: operationIdentity.key, issueId: "I_1", candidate: oldCandidate }).read().current.state, "PASS", "the native resolution cannot manufacture durable PASS");
    }
    await step();
    assert.equal(existsSync(lane), false); assert.equal(fixture.state, "open");
    writeFileSync(join(repository, "partial.txt"), "independent contribution while tracker close is pending"); git("add", "partial.txt"); git("commit", "-m", "Advance target during partial close");
    const partial = await refresh();
    assert.deepEqual(partial.facts.contradictions, [], "historical PASS still justifies already completed cleanup");
    assert.ok(partial.facts.nodes[0].integrationRecheck, "the new target combination must return to its close verification owner");
    const completed = await step();
    assert.equal(completed.run.state, "SUCCEEDED", JSON.stringify(completed));
    assert.equal((await step()).run.state, "SUCCEEDED");
    assert.equal(forks, 1); assert.equal(closeMessages, firstSuccessfulClose + 1); assert.equal(fixture.state, "closed"); assert.equal(existsSync(lane), false);
    git("merge-base", "--is-ancestor", repairRecord?.candidate ?? oldCandidate, "main");
    writeFileSync(join(repository, "independent.txt"), "later authorized contribution"); git("add", "independent.txt"); git("commit", "-m", "Advance target after completed delivery");
    assert.deepEqual((await refresh()).facts.contradictions, [], "historical integration PASS survives future target movement after closure");
    assert.equal((await step()).run.state, "SUCCEEDED");
    if (recoveryKind === "maintenance") {
      writeFileSync(join(maintenanceLane, "later.txt"), "later authorized package release"); gitAt(maintenanceLane, "add", "later.txt"); gitAt(maintenanceLane, "commit", "-m", "Later independent package");
      const nextPackage = install(gitAt(maintenanceLane, "rev-parse", "HEAD"));
      assert.notEqual(nextPackage.version.id, installed.version.id);
      assert.deepEqual((await refresh()).facts.contradictions, [], "completed maintenance retains its historical package receipt after later installation");
      assert.equal((await step()).run.state, "SUCCEEDED");
    }
    const journal = store.readEvents(runIdentity.runId);
    assert.equal(journal.filter(event => event.type === "grant.recorded").length, 1);
    assert.deepEqual(journal.filter(event => event.type === "dispatch.recorded"), retainedDispatches);
    for (const intent of journal.filter(event => event.type === "recovery.intent")) assert.deepEqual(intent.originalTaskRef, originalRef);
    assert.equal(journal.filter(event => event.type === "repair.recorded").length, 0, "integration repair never fabricates conflict history");
    assert.deepEqual(journal.filter(event => event.type === "recovery.intent").map(event => event.wave), initialExecution ? [null, null, null] : [null, recoveryKind === "maintenance" ? 1 : recoveryKind === "issue" ? 5 : null]);
    assert.equal(store.readTargetMutationWriterLock("main"), null); assert.equal(store.observeRepositoryCloseLease().state, "ABSENT");
  } finally { childProcess.execFileSync = originalExec; syncBuiltinESMExports(); rmSync(root, { recursive: true, force: true }); }
});
