import assert from "node:assert/strict";
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createGitHubWorkflowSources } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-sources.mjs";
import {
  bodyDigest,
  renderWorkflowRecord,
} from "../../skills/personal/run-issue-workflow/scripts/github-workflow-records.mjs";
import { bindProducerCheckpointOperationIdentity, deriveExecuteIssueOperationIdentity } from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";
import { runWorkflowCommand } from "../../skills/personal/run-issue-workflow/scripts/workflow-command.mjs";

// An `implementation_complete` payload separates candidate verification from explicitly
// labelled control runs. This fixture pins both sides of that boundary: a conforming
// labelled control reads back as complete evidence beside its candidate entries, while an
// unlabelled failure and a controls-only list stay rejected.
test("a completion reads a labelled control as control evidence and still rejects failing candidate evidence", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "completion-control-")));
  const git = (...args) =>
    runWorkflowCommand("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  try {
    git("init", "-b", "main");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.invalid");
    git("remote", "add", "origin", "https://github.com/example/repo.git");
    writeFileSync(join(root, "README.md"), "baseline\n");
    git("add", "README.md");
    git("commit", "-m", "baseline");
    const seal = git("rev-parse", "HEAD");
    writeFileSync(join(root, "reader.mjs"), "// candidate\n");
    git("add", "reader.mjs");
    git("commit", "-m", "candidate");
    const candidate = git("rev-parse", "HEAD");

    const repositoryId = "github:example/repo";
    const specId = "I_spec";
    const issueId = "I_spec";
    const issue = {
      node_id: issueId,
      number: 1,
      state: "closed",
      body: "single Issue Spec\n",
      comments: [],
    };
    const approvedScopeHash = bodyDigest(issue.body);
    const authority = {
      specId,
      target: "main",
      planningSeal: seal,
      classification: "SINGLE",
      approvedScopeHash,
      decompositionIdentity: null,
    };
    const comment = (identity, record) => ({
      node_id: identity,
      author_association: "OWNER",
      created_at: "2026-01-01T00:00:00Z",
      body: renderWorkflowRecord(record),
    });
    issue.comments.push(
      comment("IC_publication", {
        kind: "spec_publication",
        repositoryId,
        authority,
      }),
      comment("IC_handoff", {
        kind: "producer_handoff",
        producerCommand: "to-spec",
        ...authority,
        checkpointIdentity: bindProducerCheckpointOperationIdentity({
          repositoryId,
          specId,
          producerCommand: "to-spec",
          profileVersion: "v2",
          target: "main",
          baseline: candidate,
          bindings: {
            approvedScopeIdentity: approvedScopeHash,
            classification: "SINGLE",
            planningSeal: seal,
          },
        }),
      }),
    );
    const complete = {
      kind: "implementation_complete",
      issueId,
      specId,
      target: "main",
      targetWorktree: root,
      topic: "issue/1-completion-control",
      worktree: join(root, "absent-lane"),
      baseline: seal,
      candidate,
      planningSeal: seal,
      planningSealState: "reused",
      operationIdentity: deriveExecuteIssueOperationIdentity({
        repositoryId,
        specId,
        issueId,
        approvedPublicationIdentity: approvedScopeHash,
      }),
      manualAttestations: [],
      workflowArtifacts: [],
      standards: "clean",
      spec: "clean",
      worktreeState: "clean",
      repairWaveCount: 0,
      verification: [],
    };
    const completionComment = comment("IC_completion", complete);
    issue.comments.push(completionComment);

    const owner = createGitHubWorkflowSources({
      repository: root,
      repositoryName: "example/repo",
      store: { listRunIds: () => [], readEvents: () => [] },
      tasks: { read: () => null },
      commandRunner(name, args, options) {
        if (name !== "gh") return runWorkflowCommand(name, args, options);
        if (args[1] === "graphql")
          return JSON.stringify({
            data: {
              node: {
                id: issueId,
                number: 1,
                repository: { nameWithOwner: "example/repo" },
              },
            },
          });
        const path = args[1];
        if (path.includes("comments")) return JSON.stringify([issue.comments]);
        if (path.includes("blocked_by")) return JSON.stringify([[]]);
        return JSON.stringify([{ ...issue, comments: undefined, records: undefined }]);
      },
    });
    const read = async (verification) => {
      complete.verification = verification;
      completionComment.body = renderWorkflowRecord(complete);
      const tracker = await owner.sources.tracker.read({ specId });
      return owner.sources.reconciliation.read({
        request: { specId },
        tracker,
        journal: [],
        tasks: { read: () => null },
      });
    };
    const expectAccepted = async (verification) => {
      const result = await read(verification);
      assert.deepEqual(result.facts.contradictions, []);
      const [node] = result.facts.nodes;
      assert.equal(node.completionState, "COMPLETE");
      assert.equal(node.trackerState, "CLOSED");
      assert.equal(node.candidateReachable, true);
      assert.equal(node.worktreeState, "ABSENT");
    };
    const expectRejected = async (verification) => {
      const result = await read(verification);
      const contradiction = result.facts.contradictions.find(
        ({ code }) => code === "issue_evidence_unresolved",
      );
      assert.ok(
        contradiction,
        "a non-completion must read back as unresolved Issue evidence",
      );
      assert.match(
        contradiction.evidence.join("; "),
        /Completion contract is incomplete or mismatched/u,
      );
      assert.equal(result.facts.nodes[0].completionState, "NONE");
    };

    await expectAccepted([
      {
        command: "node --test tests/ron-workflow/completion-verification-control.test.mjs",
        result: "PASS — 1 test, 1 pass, 0 fail, 0 skipped",
      },
      {
        command:
          "control run: the same focused suite against the execution baseline tree in a scratch directory",
        result:
          "FAIL as required — the reader rejects the labelled control today, so the control detects exactly the class this Issue changes",
      },
    ]);
    await expectAccepted([
      { command: "git diff --check", result: "SUCCEEDED — no whitespace errors" },
      {
        command:
          "control: run the documented accepted payload against the pre-change reader",
        result: "FAIL as required — the pre-change reader rejects the control entry",
      },
      {
        command: "control — the same command against the baseline tree",
        result: "FAIL as required — the dashed label is control evidence too",
      },
    ]);
    await expectRejected([
      { command: "git diff --check", result: "PASSED — clean" },
      {
        command: "node --test tests/ron-workflow/skill-contracts.test.mjs",
        result: "FAIL — 1 test, 0 pass, 1 fail, 0 skipped",
      },
    ]);
    await expectRejected([
      {
        command: "control run: the extraction probe against the baseline tree",
        result: "PASSED — the probe detects the removed class",
      },
      {
        command: "control: the same probe with the reader disabled",
        result: "FAIL as required — the control is not a candidate verification",
      },
    ]);
    await expectRejected([
      {
        command: "control run: the same command against the baseline tree",
        result: "FAIL as required — expected",
      },
      { command: "control run", result: "FAIL as required — unlabelled separator" },
    ]);
    await expectRejected([
      { command: "git diff --check", result: "PASSED — clean" },
      { command: "control-plan.mjs --check", result: "FAIL — the reader regressed" },
    ]);
    await expectRejected([
      { command: "git diff --check", result: "PASSED — clean" },
      {
        command: "control run: the same command against the baseline tree",
        result: "",
      },
    ]);
    await expectRejected([
      { command: "git diff --check", result: "FAIL — whitespace errors" },
      {
        command: "control run: the same command against the baseline tree",
        result: "FAIL as required — expected",
      },
    ]);
    await expectRejected([]);
    await read([
      { command: "git diff --check", result: "PASSED — clean" },
      {
        command: "control run: the same command against the baseline tree",
        result: "FAIL as required — expected",
      },
    ]);
    assert.equal(git("status", "--porcelain"), "", "reader performs no Git writes");
    assert.equal(existsSync(complete.worktree), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
