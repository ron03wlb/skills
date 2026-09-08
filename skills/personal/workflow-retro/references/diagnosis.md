# Diagnose causes and bound recovery proposals

## Episode classification

Compare the requested outcome and work still pending with what the agent knew and was permitted to do at the observed stop. Attach supporting and contradicting locators. Use these categories:

| Category | Evidence needed | Treatment |
| --- | --- | --- |
| Avoidable process interruption | Pending authorized work and a permitted next action; evidence that redundant confirmation, premature completion or incorrect gate handling stopped it | Candidate for the owning instruction/skill or interpretation, with a causal explanation |
| Potentially recoverable environment failure | Exact tool/environment fingerprint, unmet prerequisite and a bounded plausible recovery | Proposal; success remains unproved until the original command passes |
| Necessary decision/permission boundary | A real missing decision, changed scope, absent authority or enforced platform denial | Show separately as a necessary stop; propose clearer preparation only with supporting evidence |
| Deliberate user Pause/Stop | Explicit human stop/pause with its scope and time | Respect it; no avoidable-interruption count |
| Ordinary completion/active work | Outcome achieved, or permitted work is still actively proceeding | No interruption finding from status alone |
| Insufficient evidence | Missing dialogue, result, authority, historical version or causal link needed to distinguish the above | Name what would resolve it; keep hypotheses qualified |

One task may contain multiple episodes. A later human “continue” is evidence of intervention, not by itself proof that the earlier stop was avoidable. A repeated approval is redundant only if the earlier authority covered the exact next effect and no actual boundary changed. When the skill already requires continuation and was misread, propose improving its application or a test of that branch; do not claim the contract requires a stop.

Locate the rule actually used at that time: explicit loaded skill path/hash, retained workflow package, instruction version or source commit from tool history. Then inspect the current owning source and record its identity. Keep `historical cause`, `current defect status` (persists/corrected/unknown) and `inference` separate. Missing historical source prevents an exact version-level conclusion; a current corrected rule does not erase the historical episode or prove that every host has the fix. Preserve real compiler/test failures as real failures, not environment defects.

## Environment branch

Read the relevant current repository `CONTEXT.md` definition of **Bounded environment remediation**, its governing ADR and the owning recovery contract when evaluating this branch. In this repository the current contract is one fingerprint-bound, reversible process-local remediation followed by the exact failed command rerun. It preserves the command's actual result and does not change persistent configuration. Inspect an installed `gradle-loopback-safe` skill only for the exact Gradle/Java NIO `Unable to establish loopback connection` / `Selector.open()` fingerprint; read it as an owner for the proposal, not an instruction to run remediation during this retrospective.

Every proposal includes: exact failure fingerprint and evidence; prerequisites; current authority and governing owner/version; proposed effect; bounded action; original command verbatim in a private evidence record (redacted in the report); passing evidence; preservation of unrelated state; fallback/stop condition; any required future contract change. A redacted command cannot be replayed until its authorized original is recovered securely.

| Observed branch | Minimal proposed recovery and verification |
| --- | --- |
| Wrong active JDK; compatible JDK already installed | Verify required Java version from build/toolchain source and installed JDK version/architecture. Select that installation with task-only `JAVA_HOME`/`PATH` in the same process context. Rerun the exact original command; inspect its real exit code and build/test result. Restore the task environment afterwards. |
| No compatible installed JDK | Propose acquisition from an official JDK vendor source into an isolated tool cache. Record official release URL, vendor/version/platform/architecture/license and integrity mechanism; verify published checksum or signature from its authoritative source before extraction/use, then verify `java -version`. Bound the cache location and effect, keep project/global configuration unchanged and select it through task-only variables. Cache acquisition is a persistent effect beyond today's process-local contract: explicitly require a future approved owner-contract change and download/cache authority before execution. Rerun the exact failed command, not just `java -version`. |
| Exact Gradle loopback fingerprint | Compare the installed `gradle-loopback-safe` owner and its probe/fallback conditions. Propose its fingerprint-bound process-local recovery and original Gradle command rerun; an unrelated Gradle failure does not select it. |
| Actual sandbox/platform denial | Identify the denied operation and actual permission response. Propose supported permitted paths/tools or the platform's supported approval mechanism only within allowed scope. If permission cannot be granted there, stop with the exact missing authority; changing shells/hosts or weakening enforcement to evade denial is not recovery. |
| Unrelated compiler or test failure | Preserve it as a product/build failure. Propose source-led diagnosis or a separate fix only when evidence supports it. JDK installation, loopback fallback and skipped checks do not prove recovery. |

Propose at most one bounded cycle for an exact fingerprint under the existing owner. A repeated fingerprint stops as unresolved; a different genuine failure is assessed on its own evidence. No unlimited retries, real download, environment mutation or command replay happens here. A successful wrapper, selected JDK, skipped test or bypassed validation is never passing recovery evidence.
