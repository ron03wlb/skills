import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";

test("real target and repository leases release and fence their old owner across repeated acquisition", () => {
 const root=fs.mkdtempSync(join(tmpdir(),"lease-release-"));const store=createRunStore({gitCommonDir:root});
 try{for(let i=0;i<8;i++){
  const lease=store.acquireRepositoryCloseLease({operationId:"close-"+i});
  const writer=store.acquireTargetMutationWriter({target:"main",operationId:"close-"+i});
  writer.assertCurrent();writer.release();assert.equal(store.readTargetMutationWriterLock("main"),null);
  lease.release();assert.equal(store.observeRepositoryCloseLease().state,"ABSENT");
  assert.throws(()=>writer.release(),/RELEASED/);
 }}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test("Windows EPERM retry retains the same generation, is bounded and preserves unresolved release", {skip:process.platform!=="win32"}, () => {
 const root=fs.mkdtempSync(join(tmpdir(),"lease-retry-"));const store=createRunStore({gitCommonDir:root});
 const original=fs.renameSync;let failures=0,limit=1;
 const writer=store.acquireTargetMutationWriter({target:"main",operationId:"owned"});
 const inject=()=>{fs.renameSync=(from,to)=>{if(String(to).includes(".release-")&&failures++<limit){const e=new Error("Windows sharing delay");e.code="EPERM";throw e;}return original(from,to);};syncBuiltinESMExports();};
 try{inject();writer.release();assert.equal(failures,2);assert.equal(store.readTargetMutationWriterLock("main"),null);
  fs.renameSync=original;syncBuiltinESMExports();const next=store.acquireTargetMutationWriter({target:"main",operationId:"next"});const before=store.readTargetMutationWriterLock("main");
  failures=0;limit=10;inject();assert.throws(()=>next.release(),/sharing delay/);assert.equal(failures,3);assert.deepEqual(store.readTargetMutationWriterLock("main"),before);
  fs.renameSync=original;syncBuiltinESMExports();next.release();assert.equal(store.readTargetMutationWriterLock("main"),null);
 }finally{fs.renameSync=original;syncBuiltinESMExports();fs.rmSync(root,{recursive:true,force:true});}
});
