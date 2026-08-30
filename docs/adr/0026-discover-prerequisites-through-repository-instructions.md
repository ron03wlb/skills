---
status: superseded by ADR-0039
---

# Discover prerequisites through repository instructions

Repositories opt into prerequisite handling by placing a small routing instruction in their existing `AGENTS.md` or `CLAUDE.md` that identifies a repository-owned resolver command or contract. Generic skills treat no declaration as `NOT_REQUIRED`, but a declared resolver that is missing, unreadable, or unusable as `BLOCKED`; full consumer rules stay behind the resolver instead of creating a universal workflow configuration schema.
