# Decision Log

**Architecture Decision Records (ADRs) for this agent and the infrastructure it designs.**

The problem this solves: you approve a design, the session ends, and the reasoning is gone. Next
session the agent re-derives it — sometimes differently, and it re-asks discovery questions you
already answered.

**An ADR is the durable memory of a decision and why it was made.**

---

## When To Write One

Write an ADR when a decision:

- **Is hard to reverse** — compute platform, data store, account structure, region
- **Was contested** — you chose A over B and the reasoning matters
- **Will be questioned later** — by you in six months, or by anyone who joins
- **Encodes an accepted risk** — you decided to launch with a known gap
- **Sets a convention** — naming, tagging, branching, environment separation

**Do not** write one for: routine implementation choices, anything the code already states plainly,
or a decision nobody will revisit.

`.claude/rules/architecture-principles.md` #18 says every major decision must document its
trade-offs. This directory is where that lives once the conversation ends.

---

## How To Use It

1. Copy `0000-template.md` to `NNNN-short-kebab-title.md`, next number in sequence
2. Fill it in — **the `Consequences` and `What would force a revisit` sections are the point**
3. Add a row to the index below
4. Commit it alongside the change it describes

**ADRs are immutable once accepted.** If a decision changes, write a **new** ADR that supersedes
the old one, and mark the old one `Superseded by NNNN`. The history of *why you changed your mind*
is often more valuable than the current answer.

---

## Status Values

| Status | Meaning |
|---|---|
| **Proposed** | Under discussion, not yet acted on |
| **Accepted** | Decided and in effect |
| **Superseded by NNNN** | Replaced — see the newer ADR |
| **Deprecated** | No longer applies; nothing replaced it |

---

## Index

| # | Title | Status | Date |
|---|---|---|---|
| [0001](0001-layered-agent-architecture.md) | Layered agent architecture with no cross-layer duplication | Accepted | 2026-08-19 |
| [0002](0002-mcp-read-only-by-default.md) | MCP is read-only by default; the credential is the boundary | Accepted | 2026-08-19 |
| [0003](0003-enforce-safety-with-hooks.md) | Enforce the top safety rules with hooks, not prose alone | Accepted | 2026-08-19 |

---

## For The Agent

**Read this index at the start of any architecture or deployment task.** A decision recorded here
is settled — do not re-derive it or re-ask the question it answers.

If a new decision contradicts an existing ADR, **say so explicitly** rather than silently
overriding it, and propose a superseding ADR.
