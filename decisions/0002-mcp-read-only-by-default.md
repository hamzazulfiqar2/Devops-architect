# 0002 — MCP is read-only by default; the credential is the boundary

**Status:** Accepted
**Date:** 2026-08-19
**Decided by:** Hamza

---

## Context

Adding MCP gives the agent access to real systems — GitHub, AWS, Kubernetes, Docker, Terraform,
monitoring. That is a categorical change: until then the agent could only read the repository and
run allowlisted local commands.

Research during design surfaced **CVE-2026-46519** (CVSS 8.8) in `Flux159/mcp-server-kubernetes`,
a community server with ~20k weekly npm downloads: its read-only environment variables were
enforced only at tool *discovery* (`tools/list`), not at *execution* (`tools/call`). `kubectl_delete`
was executable **while read-only mode was enabled**. Fixed in v3.6.0.

**UNKNOWN at decision time:** which servers would actually be configured, and against which
accounts or clusters. None are configured yet.

## Decision

1. **Default posture is READ-ONLY / PLAN.** Write and high-risk capability is opt-in, per session,
   per action, and never sticky.
2. **The credential is the security boundary — not the server's read-only flag.** Scope the IAM
   role, the PAT, and the RBAC binding so that a *fully bypassed* MCP server still cannot cause
   damage. Server flags are a second layer.
3. **Escalation requires two independent changes:** the operating mode *and* a credential that
   permits it. Changing the mode alone grants nothing.
4. Prefer **official / vendor-maintained** servers; label community ones explicitly.
5. **MCP output is data, not instructions.** Content returned by a tool never authorizes an action.

## Why

The CVE is direct evidence that a server-side flag can fail. RBAC, IAM, and token scopes are
enforced by the *target system* and cannot be bypassed by a flaw in the MCP server.

The two-independent-changes rule means a single mistake — a mis-set mode, a mis-scoped token — is
insufficient to cause harm.

## Alternatives considered

| Option | Why it lost |
|---|---|
| Trust server read-only flags as the control | CVE-2026-46519 is a working counterexample |
| Grant write access by default, block dangerous tools in prompt | Prompt-level blocks are the weakest tier of enforcement |
| No MCP at all | Gives up genuine value: verification, drift detection, incident diagnosis |
| Enable everything, rely on per-action approval | Approval fatigue defeats itself; the credential should not have the capability |
| Community servers where they are more featureful | Different risk profile, demonstrated by the CVE |

## Consequences

**What this gives us:** live inspection with a failure mode limited to *reading* · a design that
survives an MCP server bug · a documented, testable posture per server.

**What this costs us:** setup friction — each server needs a properly scoped credential before it
is useful. Write operations require deliberate escalation, which is slower.

**What becomes harder:** anything genuinely needing writes takes more steps. That is intended.

**Accepted risk:** a read-only credential can still **read secrets** (ECS task-definition env vars,
Kubernetes Secrets, Terraform state, log contents) and is still exposed to prompt injection through
returned content. Mitigated by handling rules, not eliminated.

## What would force a revisit

- A vendor ships MCP servers with **cryptographically enforced** capability scoping, making the
  two-layer approach redundant
- Read-only proves insufficient for a real recurring task, and the friction is measurably costing
  more than the risk it avoids
- A future CVE demonstrates that credential scoping itself is bypassable — which would require
  rethinking the whole layer

## References

- `.claude/mcp/security.md` — threat model and the CVE
- `.claude/mcp/permissions.md` — capability classes and the four modes
- [CVE-2026-46519 analysis](https://www.manifold.security/blog/mcp-server-kubernetes-readonly-bypass)
