# Tools Layer — How The Agent Reaches Real Systems

**This layer answers one question: *which tool do I use to touch a real system, and what may it
do?***

It is not MCP policy — that lives in `.claude/mcp/`. This file sits above it and covers **every**
access path, including the one people forget: the local CLI.

| Layer | Answers |
|---|---|
| `.claude/tools/` ← here | **Which access path**, and what it may do |
| `.claude/mcp/` | MCP-specific policy, servers, threat model |
| `.claude/settings.json` | The enforced allowlist and deny list |
| `.claude/hooks/` | Harness-level blocking of destructive commands |
| `.claude/rules/` | What must never happen, regardless of tool |

---

## The Two Access Paths

The agent can reach a real system two ways. **They are not equivalent, and CLI comes first.**

### Path 1 — Local CLI via Bash *(default)*

The agent runs `gh`, `git`, `docker`, `kubectl`, `terraform`, `aws` through the Bash tool,
governed by the 158-rule allowlist in `.claude/settings.json` and the safety hooks.

**Prefer this.** It uses credentials you already have, adds no new software, no new attack
surface, and no third party sees your data.

### Path 2 — MCP server

A separate process exposing structured tools. Needed when there is no CLI, when the CLI is
awkward to parse, or when the vendor's own hosted server is the system of record.

**Use only when Path 1 genuinely cannot do the job.** See `.claude/mcp/README.md`.

### The decision

```
Need live system state?
      │
      ├── Is there a CLI installed and authenticated? ──YES──▶ use the CLI
      │                                                        (allowlist + hooks apply)
      NO
      │
      ├── Would an MCP server materially improve this? ──NO──▶ say what is missing, stop
      │
      YES
      │
      └── Is a server configured?  ──NO──▶ point at .claude/mcp/configs/, do not invent one
                                   ──YES─▶ read-only first, then the approval flow
```

**Never invent a tool.** If neither path is available, say so plainly and describe what would
need configuring. `rules/` forbids claiming an action was performed when it was not.

---

## Capability Matrix

Per system: the preferred path, what it needs, and what it may do at each risk level.

### GitHub

| | |
|---|---|
| **Preferred path** | `gh` CLI — usually already authenticated |
| **Needs** | `gh auth login` |
| **MCP alternative** | Official GitHub MCP server (remote, `/readonly` toolsets) — see `mcp/servers/github.md` |
| 🟢 **Read** | `gh repo view` · `gh pr list/view/diff` · `gh run list/view` · `gh api` (GET) · all `git` reads |
| 🟡 **Write** | `gh pr create` · `gh issue create` · push a branch · commit |
| 🔴 **Destructive** | `gh repo delete` · force-push · branch protection changes · repo/org settings · Actions secrets |

### AWS

| | |
|---|---|
| **Preferred path** | `aws` CLI |
| **Needs** | `aws configure sso` then `aws sso login` — **short-lived credentials, no static keys** |
| **MCP alternative** | `awslabs/mcp` with `READ_OPERATIONS_ONLY=true` — see `mcp/servers/aws.md` |
| 🟢 **Read** | All `describe-*` / `list-*` / `get-*` — allowlisted, no prompt |
| 🟡 **Write** | Creating non-production resources — **prefer Terraform, not the CLI** |
| 🔴 **Destructive** | `delete-*` · `terminate-*` · `purge-*` · `deregister-*` · `kms schedule-key-deletion` — **hook DENIES** · IAM / security-group / `stop-*` / `modify-*` — **hook ASKS** |

> **Prefer Terraform over `aws` CLI writes.** A resource created by a CLI call exists nowhere in
> code. `architecture-principles.md` #15.

### Kubernetes

| | |
|---|---|
| **Preferred path** | `kubectl` |
| **Needs** | A kubeconfig context. **Use a `cluster-reader` ServiceAccount, not admin** |
| **MCP alternative** | `containers/kubernetes-mcp-server` — see `mcp/servers/kubernetes.md` and **CVE-2026-46519** |
| 🟢 **Read** | `get` · `describe` · `logs` · `top` · `events` · `auth can-i` · `rollout status/history` · `diff -f` |
| 🟡 **Write** | `apply` · `patch` · `scale` · `set image` · `rollout restart/undo` — **all hook ASK** |
| 🔴 **Destructive** | `delete` (a PVC deletes the data) · `drain` · `cordon` — **hook DENIES** |

> **Always confirm the context first.** `kubectl config current-context`. Acting on the wrong
> cluster is the classic catastrophic mistake.

### Docker

| | |
|---|---|
| **Preferred path** | `docker` CLI |
| **Needs** | Docker running locally. ⚠ Socket access is **root-equivalent on the host** |
| **MCP alternative** | **Usually unnecessary** — the CLI allowlist already covers inspection |
| 🟢 **Read** | `ps` · `images` · `logs` · `inspect` · `history` · `compose config/ps/logs` |
| 🟡 **Write** | `build` · `tag` · `push` — prompt |
| 🔴 **Destructive** | `system prune` · `volume rm` — **hook DENIES** |

### Terraform

| | |
|---|---|
| **Preferred path** | `terraform` CLI |
| **Needs** | Provider credentials (the AWS profile above) |
| **MCP alternative** | HashiCorp MCP — **registry docs + HCP/TFE read only**. It cannot run a local apply. `ENABLE_TF_OPERATIONS=false` |
| 🟢 **Read** | `fmt -check` · `validate` · `show` · `output` · `state list` · `providers` · `graph` · `workspace show` |
| 🟡 **Plan** | `init` · `plan` — confirm **account, region, workspace** first; needs live credentials |
| 🔴 **Apply / destroy** | `apply` — **hook ASKS** · `destroy`, `state rm/mv`, `force-unlock`, `import` — **hook DENIES** |

### Monitoring

| | |
|---|---|
| **Preferred path** | `aws cloudwatch` / `aws logs` CLI |
| **MCP alternative** | Grafana MCP (`--disable-write`) — see `mcp/servers/monitoring.md` |
| 🟢 **Read** | Metrics, alarms, log queries, dashboards, alert state |
| 🟡 **Write** | Creating alarms and dashboards |
| 🔴 **Destructive** | **Deleting or disabling alert rules** · deleting log groups · reducing retention — you lose detection silently |

---

## Check What Is Actually Available

Never assume a tool is installed. Run:

```bash
npx claude-devops-architect tools     # or: node bin/cli.js tools
```

It reports, per system: installed · version · authenticated · which access path is usable.

Manual equivalents:

```bash
gh auth status                  # GitHub
aws sts get-caller-identity     # AWS — ALSO tells you WHICH ACCOUNT
kubectl config current-context  # Kubernetes — ALWAYS run before any kubectl action
terraform version               # Terraform
docker info                     # Docker
```

**If a tool is missing, say so and give the install command. Do not pretend, and do not silently
switch to guessing.**

---

## Permission Levels

The four levels map onto the enforced controls already in place:

| Level | Meaning | Enforced by |
|---|---|---|
| **L0 — Reasoning** | No external access. Advice only | Default. Nothing to enforce |
| **L1 — Read-only** | Inspect repos, AWS, K8s, Terraform, logs, metrics | The **158-rule allowlist** — reads run without prompting |
| **L2 — Safe writes** | Branch, PR, non-prod config, generate IaC/manifests | Not allowlisted → **prompts** |
| **L3 — Production / destructive** | apply · delete · IAM · networking · secrets · prod deploy | **Hooks** — `ASK` or `DENY`, and they fire even in relaxed permission modes |

**L1 is free. L2 prompts. L3 stops.** No configuration switches L3 off — the hook does not consult
the allowlist.

---

## Using A Tool Safely

Every tool-based operation follows the same four beats:

```
OBSERVE   inspect current state — read-only, confirm WHICH target
PLAN      state what should change, and the blast radius
ACT       execute only what was authorized, one thing at a time
VERIFY    prove the desired state was reached — evidence, not assumption
```

**Never skip OBSERVE.** A fix applied without inspecting the current state is a guess.
**Never skip VERIFY.** `production-rules.md` rule 7: a command succeeding is not proof it worked.

---

## Current Gaps

Honest state of this machine, as recorded when this file was written:

| System | Status |
|---|---|
| GitHub | ✅ `gh` installed and authenticated |
| Docker | ✅ installed |
| Terraform | ✅ installed — a fresh shell may be needed for PATH |
| AWS CLI | ✅ installed · ⚠ **no credentials — run `aws configure sso`** |
| Kubernetes | ⚠ `kubectl` installed, **no cluster configured** |
| Helm | ❌ not installed |
| MCP servers | ❌ **none configured.** `.mcp.json.example` is the starting point |

**Re-run `tools` rather than trusting this table** — it is a snapshot, not a fact.
