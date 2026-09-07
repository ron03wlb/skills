import assert from "node:assert/strict";
import test from "node:test";
import { assessBootstrapHandoff } from "../../skills/personal/run-issue-workflow/scripts/run-preparation.mjs";
import { configureHostInput } from "../../skills/personal/run-issue-workflow/scripts/installed-entry.mjs";

const fixture = () => {
 const authority = { specId: "spec-64", target: "main", approvedScopeHash: "scope-revision", decompositionIdentity: "decomposition" };
 const operations = ["workflow-install", "task-create", "task-message", "local-close", "tracker-write"].map(action => ({action,scope:"exact-maintenance-65:"+action}));
 const human = { repositoryId:"github:example/skills", ...authority, issueId:"issue-65", startAuthority:"human-original-Start-and-approved-revision", operations };
 return { human, control:{state:"ACTIVE",connected:true,authority:human.startAuthority}, repositoryId:human.repositoryId, authority,
   readiness:{state:"READY"}, approvals:operations.map(item=>({...item,authority:human.startAuthority})), hasRunGrant:false, blockers:[],
   node:{issueId:"issue-65",trackerState:"OPEN",taskState:"NONE",completionState:"NONE",candidateReachable:false,worktreeState:"ABSENT"} };
};
test("original human Start reaches exact maintenance, close and fresh continuation without a second command", () => {
 const input=fixture(), before=structuredClone(input);
 const first=assessBootstrapHandoff(input);assert.equal(first.state,"EXECUTE");assert.equal(first.nextOwner,"execute-issue");assert.deepEqual(input,before);
 assert.deepEqual(assessBootstrapHandoff(structuredClone(input)),first,"lost response reuses operation identity");
 Object.assign(input.node,{completionState:"COMPLETE",worktreeState:"PRESENT"});
 assert.equal(assessBootstrapHandoff(input).state,"CLOSE");
 input.node.candidateReachable=true;assert.equal(assessBootstrapHandoff(input).state,"CLOSE");
 input.node.worktreeState="ABSENT";assert.equal(assessBootstrapHandoff(input).state,"CLOSE","cleanup alone is not delivery");
 input.node.trackerState="CLOSED";const done=assessBootstrapHandoff(input);assert.equal(done.state,"CONTINUE");assert.equal(done.nextOwner,"run-issue-workflow");
 assert.deepEqual(done.operationIdentity,first.operationIdentity);assert.deepEqual(assessBootstrapHandoff(input),done);
 input.hasRunGrant=true;assert.equal(assessBootstrapHandoff(input).state,"BLOCKED","existing Runs retain ordinary reconciliation");
});
test("changed authority, controls, partial evidence and missing exact approvals never authorize bootstrap", () => {
 const changes=[
   x=>{x.human.issueId="outsider";},x=>{x.human.specId="other";},x=>{x.human.target="other";},
   x=>{x.authority.approvedScopeHash="new";},x=>{x.authority.decompositionIdentity="new";},
   x=>{x.approvals.pop();},x=>{x.human.operations[0].scope="other";},x=>{x.human.operations=[];},
   x=>{x.control.state="PAUSE";},x=>{x.control.state="STOP";},x=>{x.control.connected=false;},
   x=>{x.control.authority="revoked";},x=>{x.readiness.state="UNKNOWN";},x=>{x.hasRunGrant=true;},
   x=>{x.blockers=[{trackerState:"OPEN"}];},x=>{x.blockers=[undefined];},x=>{x.node.taskState="EXECUTING";},
   x=>{x.node.worktreeState="UNKNOWN";},x=>{x.node.completionState="BLOCKED";},
   x=>{x.node.trackerState="CLOSED";},x=>{x.contradictions=[{code:"identity_conflict"}];}
 ];
 for(const change of changes){const input=fixture();change(input);assert.equal(assessBootstrapHandoff(input).state,"BLOCKED",String(change));}
});
test("native TTY mode has reversible ownership and pipe input requires no terminal command", () => {
 const calls=[];const input={isTTY:true,isRaw:false,setRawMode(value){calls.push(value);this.isRaw=value;}};
 const restore=configureHostInput(input);assert.deepEqual(calls,[true]);restore();assert.deepEqual(calls,[true,false]);
 configureHostInput({isTTY:false})();assert.throws(()=>configureHostInput({isTTY:true}),/native raw mode/);
});
