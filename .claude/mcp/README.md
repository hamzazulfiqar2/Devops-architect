# MCP Integration Layer

**MCP provides ACCESS to real systems. It is an integration layer *underneath* the existing agent
architecture — it does not replace or restructure any of it.**

---

## Where MCP Sits

| Layer | Provides | Location |
|---|---|---|
| **CLAUDE.md** | ORCHESTRATION — what to invoke, when | `/CLAUDE.md` |
| **Agents** | SPECIALIZATION — expert roles | `.claude/agents/` |
| **Skills** | KNOWLEDGE — how to perform work | `.claude/skills/` |
| **Workflows** | PROCESS — in what order, with gates | `.claude/workflows/` |
| **References** | FACTS — what is true about a technology | `.claude/references/` |
| **Rules** | GOVERNANCE — what must never happen | `.claude/rules/` |
| **Templates** | OUTPUT — deliverable structure | `.claude/templates/` |
| **MCP** | **ACCESS — reaching real systems** | `.claude/mcp/` ← this layer |

**MCP knows nothing.** It cannot tell you whether ECS or EKS is right, whether a probe is
configured correctly, or whether a security group is dangerous. It only fetches facts from a live
system. The *reasoning* stays in skills, the *process* in workflows, the *limits* in rules.

> **MCP is a sensor, not a brain, and never a licence.**

---

## Files In This Layer

| File | Purpose |
|---|---|
| `README.md` | This file — entry point and decision flow |
| `architecture.md` | How MCP integrates with agents, skills, workflows, and rules |
| `permissions.md` | READ / WRITE / HIGH-RISK classification and the four operating modes |
| `security.md` | Threat model, credential handling, known CVEs, hardening |
| `servers/github.md` | GitHub MCP — official, remote or local |
| `servers/aws.md` | AWS MCP — official (awslabs), read-only by default |
| `servers/kubernetes.md` | Kubernetes MCP — options, and a real read-only-bypass CVE |
| `servers/docker.md` | Docker MCP — official gateway vs community inspection server |
| `servers/terraform.md` | Terraform MCP — official, registry + HCP/TFE only |
| `servers/monitoring.md` | Grafana / CloudWatch / Prometheus / Datadog observability access |
| `configs/README.md` | How to configure servers **without putting secrets in this repo** |

---

## When To Use MCP — The Decision

**Never use MCP simply because it is available.** Use it only when live system access
*materially* improves the answer, or is required to perform the task.

```
User request
     │
     ▼
Can this be answered from the project, code, skills, or references?
     │
     ├── YES ──▶ Answer from skills / workflows / references. STOP. No MCP.
     │
     └── NO — real environment state is required
              │
              ▼
        Determine which external system holds the answer
              │
              ▼
        Use the appropriate MCP server — READ / INSPECT FIRST
              │
              ▼
        ANALYZE with the relevant skill (not with MCP)
              │
              ▼
        PLAN the change
              │
              ▼
        Is the action WRITE or HIGH-RISK?  ──YES──▶ REQUEST APPROVAL ──▶ wait
              │                                             │
              NO                                            ▼
              │                                    approved for THIS action
              ▼                                             │
        Execute the permitted action ◀────────────────────-─┘
              │
              ▼
        VALIDATE the outcome (evidence, not assumption)
              │
              ▼
        REPORT: what was found, what was done, what remains unknown
```

### Use MCP when

- The question is about **live state**: what is actually running, deployed, configured, or failing
- Diagnosing a real incident — logs, metrics, events, task stop reasons
- Verifying that deployed reality matches the code in the repository (drift)
- A security review needs the **effective** configuration, not the declared one
- Cost analysis needs actual billing data rather than list-price estimates

### Do NOT use MCP when

- The answer is in the repository, a skill, or a reference file
- The user asked a **learning question** ("what is a NAT Gateway?") — that is `references/`
- You are designing an architecture that does not exist yet
- You could answer from the conversation you already had
- It would only confirm something already established

**A wasted MCP call costs latency, tokens, API quota, and — with a write-capable credential —
risk. Reach for the repository first.**

---

## The Three Rules That Bind This Layer

1. **MCP never overrides `.claude/rules/`.** If `production-rules.md` says a deploy needs explicit
   approval, no MCP capability changes that. A tool being *available* is not authorization.
2. **Default is READ-ONLY.** Write and high-risk capability is opt-in, per session, per action.
   See `permissions.md`.
3. **The credential is the real boundary — not the server's flag.** A `--read-only` flag is a
   convenience, not a security control. Scope the token, the IAM role, and the RBAC binding so
   that a bypassed flag still cannot cause damage. See `security.md`.

---

## Current Status

**No MCP server is configured yet.** This layer is documentation and policy; `configs/README.md`
explains how to enable a server when you choose to, and every `servers/*.md` file ends with a
test procedure.

Start with **GitHub read-only** and **AWS read-only** — they deliver the most value at the lowest
risk. Add others only when a real task needs them.
