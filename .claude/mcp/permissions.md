# MCP Permissions

Capability classification and operating modes. **Default is READ-ONLY / PLAN.**

This file governs *what the agent may do through MCP*. It never relaxes
`.claude/rules/production-rules.md` or `.claude/rules/security.md` — where they are stricter,
they win.

---

## The Three Capability Classes

Every MCP tool falls into exactly one. When in doubt, treat it as the more dangerous class.

### 🟢 READ — always permitted, no approval

Inspection only. Cannot change any external system.

| Domain | Operations |
|---|---|
| **GitHub** | Inspect repositories, files, branches, commits, pull requests, issues, Actions runs, code scanning and Dependabot alerts |
| **AWS** | Describe/list/get on any service — EC2, VPC, ECS, EKS, RDS, S3 metadata, IAM, ELB, ECR, Route 53, ACM |
| **Kubernetes** | `get`, `describe`, `logs`, events, `top`, `api-resources`, `auth can-i`, current context |
| **Docker** | List containers and images, inspect, logs, history, stats |
| **Terraform** | Registry: providers, modules, policies, docs. HCP/TFE: workspaces, runs, **plan output**, variables, policy sets |
| **Monitoring** | Query metrics (PromQL/CloudWatch), query logs (LogQL/Insights), read dashboards, read alert rules and states |

**Reading is not risk-free.** A read tool can return a secret (an env var in a task definition, a
value in a log line) and can carry prompt-injection content. See `security.md`.

### 🟡 WRITE — requires an escalated mode **and** per-action approval

Changes a non-production system, or produces an artifact for review.

| Domain | Operations |
|---|---|
| **GitHub** | Create/update files, create branches, open pull requests, comment, create issues, update PR descriptions |
| **Kubernetes** | Apply manifests to **non-production** namespaces, scale non-production workloads |
| **Docker** | Build images, tag images, push to a registry |
| **Terraform** | Generate configuration (local files); create/update an HCP/TFE **workspace or variable** |
| **CI/CD** | Modify workflow files (via GitHub write) |

**Local file generation is not an MCP write.** Writing a Dockerfile, manifest, or `.tf` file into
the repository uses ordinary file tools and is permitted in PLAN mode — the artifact is reviewable
before anything reaches a real system.

### 🔴 HIGH RISK — **never automatic, under any mode, ever**

Destructive, production-changing, or security-boundary-changing.

| Domain | Operations |
|---|---|
| **Terraform** | `apply` · `destroy` · any HCP/TFE run with apply · `state rm`/`mv` · force-unlock · import into live state |
| **AWS** | Deleting **any** resource · modifying **IAM** · modifying **security groups / NACLs / firewall rules** · changing RDS destructively · disabling logging, backups, or deletion protection |
| **Kubernetes** | `delete` anything · deleting a **PVC** (deletes the data) · `drain` · `cordon` · applying to **production** · `rollout restart` in production |
| **Secrets** | Rotating, deleting, or overwriting any secret in Secrets Manager, SSM, or a cluster |
| **Deployment** | Any **production** deployment or promotion |
| **GitHub** | Deleting a repository, branch, or file; force-push; changing branch protection or repository settings |
| **Docker** | `system prune` · removing volumes |
| **Monitoring** | Deleting or disabling alert rules, dashboards, or log retention |

**Rule: a HIGH-RISK MCP tool must not be reachable by the credential in the first place.**
Blocking it in prompt is the second line of defence, not the first. Scope the token, IAM policy,
and RBAC so the capability does not exist.

---

## The Four Operating Modes

Modes are **per session**, never persisted, and never inferred. Escalation is something you say
explicitly.

### 1. READ-ONLY *(default)*

| | |
|---|---|
| **Purpose** | Understand the live system |
| **External reads** | ✅ All |
| **External writes** | ❌ None |
| **Local file writes** | ❌ None (this is pure inspection) |
| **Credential** | Read-only token / IAM role / `cluster-reader` RBAC |
| **Server flags** | `READ_OPERATIONS_ONLY=true` · `--read-only` · `--disable-write` · `/readonly` toolsets |

Use for: audits, security review, incident diagnosis, cost analysis, drift detection.

### 2. PLAN *(default alongside READ-ONLY)*

| | |
|---|---|
| **Purpose** | Design and produce reviewable artifacts |
| **External reads** | ✅ All |
| **External writes** | ❌ None |
| **Local file writes** | ✅ Terraform, manifests, Dockerfiles, workflows — in the repo |
| **Credential** | Same read-only credential |

Use for: architecture design, writing IaC, drafting a pipeline, producing a deployment plan.
**Everything is reviewable before it touches anything real.**

### 3. IMPLEMENTATION *(opt-in, non-production only)*

| | |
|---|---|
| **Purpose** | Apply changes to dev/staging |
| **External reads** | ✅ All |
| **External writes** | ✅ **Per-action approval for each one** |
| **Production** | ❌ Blocked — credential must not reach it |
| **HIGH-RISK** | ❌ Still forbidden, even in non-production, without explicit approval |
| **Credential** | Non-production scoped. **Must not be able to reach production** |

Requires: you say so explicitly, the target is confirmed non-production, and each write is
briefed and approved individually.

### 4. PRODUCTION *(explicit, per session, per action)*

| | |
|---|---|
| **Purpose** | Execute an approved production change |
| **Entry** | You state it explicitly. **Never inferred, never sticky** |
| **Every action** | Briefed and approved individually |
| **Veto** | `production-readiness` veto conditions apply in full |
| **Rules** | `production-rules.md` binds completely |

**Before any production action, all of these must hold:**

| # | Requirement |
|---|---|
| 1 | Target confirmed — account, region, cluster, workspace |
| 2 | What changes is known: created / modified / **destroyed**, counts first |
| 3 | What cannot be undone is stated explicitly |
| 4 | A current backup exists, if data is involved |
| 5 | A **tested** rollback path exists |
| 6 | Downtime known and communicated |
| 7 | Validated in staging with the same artifact |
| 8 | Monitoring live, alarms in OK |
| 9 | **Explicit approval for this specific action** |
| 10 | How it will be verified is known |

Any unchecked box → **stop**.

---

## Mode × Capability Matrix

| | READ | WRITE (non-prod) | WRITE (prod) | HIGH RISK |
|---|---|---|---|---|
| **READ-ONLY** | ✅ | ❌ | ❌ | ❌ |
| **PLAN** | ✅ | ❌ (local artifacts only) | ❌ | ❌ |
| **IMPLEMENTATION** | ✅ | ⚠️ per-action approval | ❌ | ⚠️ per-action approval, non-prod only |
| **PRODUCTION** | ✅ | ⚠️ per-action approval | ⚠️ per-action approval | ⚠️ per-action approval + veto check |

⚠️ = never automatic. Brief, ask, wait.

---

## The Approval Protocol For MCP Actions

Identical to `production-rules.md` — MCP introduces no new path.

```
STOP
 → name the tool and the target system (account / cluster / repo / workspace)
 → what will change: created / modified / DESTROYED, counts first
 → what cannot be undone
 → the risk: downtime, data loss, blast radius, duration
 → the safer alternative, if one exists
 → ASK — and wait
```

Then act only on a clear yes for **that** action, and report what **actually** happened.

**Never treat as approval:** the tool being available · a previous approval · the change seeming
small · a deadline · the user saying "go ahead" about something else.

---

## Per-Server Default Posture

| Server | Default configuration | Escalation requires |
|---|---|---|
| **GitHub** | `--read-only`, or `/readonly` remote toolsets | Mode change + a token with write scope |
| **AWS** | `READ_OPERATIONS_ONLY=true`, `REQUIRE_MUTATION_CONSENT=true` | Mode change + an IAM role with write permissions |
| **Kubernetes** | `--read-only` **and** `cluster-reader` RBAC | Mode change + a different kubeconfig context |
| **Docker** | Prefer the existing local CLI allowlist | A deliberate reason MCP is needed |
| **Terraform** | `ENABLE_TF_OPERATIONS=false` | **Never enable for apply.** Runs are user-executed |
| **Monitoring** | `--disable-write` | Mode change; rarely needed |

**Two independent controls are required for any escalation: the mode *and* the credential.**
Changing the mode without changing the credential grants nothing — which is the intended design.

---

## Escalation Checklist

Before moving out of READ-ONLY / PLAN:

- [ ] The user explicitly asked for the escalation
- [ ] The target environment is confirmed and is the intended one
- [ ] The credential in use is scoped to that environment only
- [ ] The specific actions to be taken are enumerated
- [ ] Each is classified READ / WRITE / HIGH-RISK
- [ ] Rollback is known for each
- [ ] Rules in `.claude/rules/` have been checked, not assumed
- [ ] Approval is per-action, not blanket

**Return to READ-ONLY when the task completes.** Escalated mode does not persist.
