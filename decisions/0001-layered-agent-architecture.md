# 0001 — Layered agent architecture with no cross-layer duplication

**Status:** Accepted
**Date:** 2026-08-19
**Decided by:** Hamza

---

## Context

The agent began as a single large `CLAUDE.md` (~610 lines) that mixed orchestration with technical
content — Docker guidance, Kubernetes object lists, Terraform commands, AWS service comparisons.
Every session loaded all of it, and the same knowledge started appearing in two or three places as
skills were added.

Constraints at the time: solo operator, learning DevOps, no team, no existing agent conventions
to inherit.

**UNKNOWN at decision time:** whether the agent would actually be used against real projects, or
how much of the content would ever be read.

## Decision

Split the agent into seven layers, each with one responsibility, and forbid duplication between
them:

| Layer | Provides |
|---|---|
| `CLAUDE.md` | Orchestration — what to invoke, when |
| `agents/` | Specialization |
| `skills/` | Knowledge — how to perform work |
| `workflows/` | Process — order and gates |
| `references/` | Facts — what is true |
| `rules/` | Governance — what must never happen |
| `templates/` | Output structure |
| `mcp/` | Access to live systems |

`CLAUDE.md` became a routing table. Technical content moved out.

## Why

Duplication is the failure mode that kills this kind of system: two copies of a fact drift, and
then nobody knows which is authoritative. Single responsibility per layer makes every question
have exactly one home.

Secondary benefit: `CLAUDE.md` dropped from ~610 to ~370 lines, reducing always-loaded context.

## Alternatives considered

| Option | Why it lost |
|---|---|
| One large `CLAUDE.md` | Loads everything every session; duplication inevitable as it grows |
| Skills only, no references | Skills describe *method*; factual lookup (cost floors, limits) does not belong in them |
| References only, no skills | Facts without method produce inconsistent output |
| Flat file layout, no layer semantics | Nothing tells the agent *when* to read what |

## Consequences

**What this gives us:** one home per question · a routing table that is auditable · reduced
always-on context · layers replaceable independently.

**What this costs us:** 76 files instead of one. Navigation requires the index in `CLAUDE.md` §15.
More discipline required when adding content — "which layer does this belong to?" must be answered
each time.

**What becomes harder:** answering a question that spans layers now requires opening several files.

**Accepted risk:** ~80% of the content sits in layers nothing auto-loads (`workflows/`,
`templates/`, `references/`, `mcp/`). They are only effective if `CLAUDE.md` routes to them and the
model chooses to open them. **This is unvalidated** — see "What would force a revisit".

## What would force a revisit

- **The system is run against a real project and the reference files are never opened.** If routing
  does not actually pull them in, they are dead weight and should be folded into skills or deleted
- A second person starts using it and cannot navigate the layers
- Always-loaded context (`CLAUDE.md` + `rules/`, currently ~18k tokens) becomes a cost problem

## References

- `CLAUDE.md` §2 (component orchestration), §15 (layer index)
- `.claude/references/README.md` — layer boundary table
