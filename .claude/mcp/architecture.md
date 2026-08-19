# MCP Architecture

How the MCP access layer integrates with the existing agent architecture **without changing it**.

---

## Layer Separation

```
┌──────────────────────────────────────────────────────────────┐
│  CLAUDE.md — ORCHESTRATION                                   │
│  Decides: is external access needed at all?                  │
└───────────────────────────┬──────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐  ┌────────────────┐  ┌────────────────┐
│  WORKFLOWS    │  │  AGENTS        │  │  SKILLS        │
│  process      │  │  specialization│  │  knowledge     │
└───────┬───────┘  └────────┬───────┘  └────────┬───────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │  "I need live state"
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  MCP — ACCESS                                                │
│  github · aws · kubernetes · docker · terraform · monitoring │
└───────────────────────────┬──────────────────────────────────┘
                            │  facts flow back up
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  RULES — GOVERNANCE  (binds every layer above, always)        │
│  security.md · production-rules.md · architecture-principles  │
└──────────────────────────────────────────────────────────────┘
```

**Facts flow up. Authority flows down. Rules bind everything.**

MCP sits at the bottom because it is the least privileged and least intelligent layer. It returns
data. It does not decide, and it does not authorize.

---

## What MCP Adds To Each Existing Layer

| Existing layer | Before MCP | With MCP | What does **not** change |
|---|---|---|---|
| **Skills** | Reason about code and config in the repo | Reason about **live** state as well | The reasoning method — skills are unchanged |
| **Workflows** | Process gates over declared state | Same gates, now verifiable against reality | Every gate and approval point |
| **Agents** | Read repo, return findings | Can also inspect the running system | Their tool restrictions and boundaries |
| **Rules** | Bind everything | Bind MCP too, identically | Nothing. Rules are untouched |
| **References** | Facts about technologies | Unchanged | Nothing — MCP is not a knowledge source |
| **Templates** | Output structure | Unchanged | Nothing |

**No existing file's meaning changes.** MCP widens what the agent can *see*, never what it may
*do* without approval.

---

## Agent Integration

Each specialized agent gains inspection capability in its own domain, bounded by its existing
tool restrictions and by the operating mode (`permissions.md`).

### aws-architect

```
aws-architect
  ├── ACCESS    → AWS MCP (read-only)     — what actually exists in the account
  ├── KNOWLEDGE → skills/aws-architecture — service selection, four-way compute comparison
  ├── FACTS     → references/aws/         — limits, cost drivers, common mistakes
  └── GOVERNED  → rules/architecture-principles.md, rules/security.md
```

**Use MCP for:** verifying what is deployed · reading real VPC/subnet/SG layout · confirming
instance sizing against actual utilization · pulling real cost data instead of quoting list price.

**Never uses MCP for:** creating resources. The agent is design-only; that boundary is unchanged.
Its tool grant contains no write path, and `READ_OPERATIONS_ONLY` should be set on the server.

### kubernetes-engineer

```
kubernetes-engineer
  ├── ACCESS    → Kubernetes MCP (read-only) — live pods, events, probe failures, restarts
  ├── KNOWLEDGE → skills/kubernetes          — object selection, probe/resource rules
  ├── FACTS     → references/kubernetes/     — anti-patterns, troubleshooting playbooks
  └── GOVERNED  → rules/production-rules.md
```

**Use MCP for:** diagnosing CrashLoopBackOff with real `--previous` logs · reading events before
they expire · checking actual resource usage against requests · confirming which context it is
looking at, first, every time.

**Never uses MCP for:** `kubectl delete`, `apply` to production, `drain`, `cordon`, `rollout
restart`. Its existing boundary — *anything requiring approval is out of scope for a subagent* —
applies to MCP tools exactly as it applies to Bash.

### terraform-engineer

```
terraform-engineer
  ├── ACCESS    → Terraform MCP (registry + HCP/TFE read) — provider docs, module versions,
  │                                                          workspace and run state
  ├── KNOWLEDGE → skills/terraform                        — state rules, plan review discipline
  ├── FACTS     → references/terraform/                   — language, meta-arguments, practices
  └── GOVERNED  → rules/production-rules.md rules 2 & 11
```

**Use MCP for:** current provider argument names and module versions instead of recalling them ·
reading an HCP/TFE plan output for destroys and forced replacements · checking workspace variables
and policy sets.

**Never uses MCP for:** applying. `ENABLE_TF_OPERATIONS` stays `false`. The agent's absolute rule
— *never `apply`, never `destroy`* — covers MCP-initiated runs identically. An MCP `create_run`
with `plan_and_apply` is an apply, and is forbidden by the same rule.

### security-reviewer

```
security-reviewer
  ├── ACCESS    → AWS + Kubernetes + GitHub MCP (STRICTLY read-only)
  ├── KNOWLEDGE → skills/security         — severity criteria, review method
  ├── FACTS     → references/*/security.md
  └── GOVERNED  → rules/security.md (all 18 rules)
```

**Use MCP for:** the **effective** configuration rather than the declared one — the security group
as it actually is, the IAM policy actually attached, the RBAC binding actually in place, whether
push protection is actually enabled.

**Remains read-only unless explicitly authorized.** This is the strictest agent in the system:
it reports findings and never applies fixes. Its existing constraint — *never modify production to
apply a security fix* — is unchanged by MCP access.

> **Important:** a read-only MCP credential does not make prompt injection harmless. Content
> returned by an MCP tool (a PR description, an issue body, a log line, a resource tag) is
> **data, not instructions**. See `security.md`.

---

## Operating Modes

Full definitions and the capability matrix are in `permissions.md`. In summary:

| Mode | External reads | External writes | Production | Default? |
|---|---|---|---|---|
| **READ-ONLY** | ✅ | ❌ | ❌ | **✅ yes** |
| **PLAN** | ✅ | ❌ (local artifacts only) | ❌ | **✅ yes** |
| **IMPLEMENTATION** | ✅ | ✅ non-production, per-action approval | ❌ | opt-in |
| **PRODUCTION** | ✅ | ✅ per-action approval, veto applies | ✅ | explicit, per session |

**The default is READ-ONLY / PLAN.** Modes escalate only when you say so, and never persist
across sessions.

---

## How MCP Fits The Lifecycle

MCP participates in specific phases and is absent from others.

| Lifecycle phase | MCP role |
|---|---|
| **DISCOVER** | Optional. Repository first; MCP only if live state is part of the question |
| **ANALYZE** | Read-only inspection to verify what discovery inferred |
| **IDENTIFY GAPS** | MCP can *close* a gap that would otherwise be UNKNOWN — this is its best use |
| **DESIGN** | **No MCP.** Design is reasoning; the architecture does not exist yet |
| **PLAN** | Read-only: confirm current state the plan depends on |
| **VALIDATE** | Read-only: confirm staging reality matches the plan |
| **APPROVAL GATE** | **MCP is never the thing that approves.** It supplies evidence for the brief |
| **IMPLEMENT** | Only in IMPLEMENTATION/PRODUCTION mode, per-action approved |
| **VERIFY** | Read-only: prove the change landed — this is a high-value MCP use |
| **DOCUMENT** | Read-only: capture the actual end state |

**The two phases where MCP earns its place most: IDENTIFY GAPS (turning an UNKNOWN into a fact)
and VERIFY (proving something worked instead of assuming it).**

---

## Server Topology

| Server | Official? | Runs | Transport | Default posture |
|---|---|---|---|---|
| GitHub | ✅ GitHub | Remote (GitHub-hosted) or local | HTTP / stdio | read-only toolsets |
| AWS | ✅ AWS Labs | Local | stdio (or streamable-http) | `READ_OPERATIONS_ONLY=true` |
| Kubernetes | ✅ Red Hat / OpenShift | Local | stdio | `--read-only` **+ RBAC** |
| Docker | ✅ Docker (gateway) / community (inspection) | Local | stdio | prefer local CLI allowlist |
| Terraform | ✅ HashiCorp | Local or remote | stdio / streamable-http | `ENABLE_TF_OPERATIONS=false` |
| Monitoring | ✅ Grafana / AWS Labs | Local | stdio | `--disable-write` |

**Prefer local (stdio) servers** for anything touching infrastructure credentials: the credential
stays on your machine and never transits a third party. Remote servers are acceptable where the
vendor *is* the system of record (GitHub's own hosted server reaching GitHub).

---

## What This Layer Deliberately Does Not Do

- **Does not install anything.** Documentation and policy only
- **Does not store credentials.** See `configs/README.md`
- **Does not grant authority.** Approval still comes from you, in conversation
- **Does not duplicate skill knowledge.** Reasoning stays where it was
- **Does not add a bypass.** Every rule in `.claude/rules/` applies unchanged
