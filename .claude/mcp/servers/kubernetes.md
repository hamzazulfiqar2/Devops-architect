# MCP Server — Kubernetes

> ⚠️ **Read `../security.md` before enabling any Kubernetes MCP server.** This target has a
> documented, high-severity read-only **bypass** CVE in a widely used community server.

---

## Options

| Server | Maintainer | Status | Recommendation |
|---|---|---|---|
| **`containers/kubernetes-mcp-server`** | Red Hat / containers org | **Vendor-backed** ✅ | **Preferred** |
| `openshift/openshift-mcp-server` | Red Hat / OpenShift | **Vendor-backed** ✅ | Use if on OpenShift |
| `patrickdappollonio/mcp-kubernetes-ro` | Individual | **Community** ⚠️ | **Read-only by construction** — a defensible choice when you want no write path to exist at all |
| `Flux159/mcp-server-kubernetes` | Individual (npm) | **Community** ⚠️ | **Only ≥ v3.6.0.** See CVE below |

**Recommended: `containers/kubernetes-mcp-server`, with `--read-only` AND a `cluster-reader`
service account.**

| | |
|---|---|
| **Transport** | stdio |
| **Local or remote** | **Local** — uses your kubeconfig |
| **Docs** | https://github.com/containers/kubernetes-mcp-server |

---

## ⚠️ CVE-2026-46519 — Read-Only Bypass

| | |
|---|---|
| **Affected** | `Flux159/mcp-server-kubernetes` (**community**, npm, ~20k weekly downloads) |
| **Severity** | **CVSS 8.8 — High** |
| **Mechanism** | `ALLOW_ONLY_READONLY_TOOLS`, `ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS`, and `ALLOWED_TOOLS` were enforced **only at `tools/list`**, not at `tools/call`. Any client knowing a tool name could invoke it directly |
| **Impact** | `kubectl_delete` **executable while read-only mode was enabled** |
| **Fixed in** | **v3.6.0** |
| **Advisory** | GHSA-cr22-wjx7-2w6m |

**This is the single most important fact in this layer.** It is why the design rule is:

> **RBAC is the boundary. The `--read-only` flag is a second layer, never the only one.**

A `cluster-reader` service account cannot be bypassed by any MCP server bug, because the
**API server** enforces it.

---

## Authentication

Uses your existing **kubeconfig** — no new credential mechanism.

| Source | Notes |
|---|---|
| `~/.kube/config` | Default. Current context is used |
| `KUBECONFIG` | Points at an alternative file |
| Context selection | **Verify before every action** |

### The recommended setup

Create a dedicated read-only identity and a kubeconfig context that uses it:

1. A ServiceAccount bound to the built-in **`view`** ClusterRole, or a custom `cluster-reader`
2. A kubeconfig context using that ServiceAccount's token
3. Point the MCP server at **that context only**

**Never point the MCP server at an admin context.** If the credential is `cluster-admin`, no flag
protects you.

---

## Safety Flags

| Flag | Effect |
|---|---|
| **`--read-only`** | No write operations (create, update, delete). **Most restrictive** |
| `--disable-destructive` | Blocks delete; **allows create and update**. Has **no effect** when `--read-only` is used |

Vendor guidance: run with a dedicated service account such as `cluster-reader`, and optionally
`--read-only` **as a safeguard if RBAC is not already tightly scoped**. Do both.

---

## Capabilities

### 🟢 READ
`get` and `describe` any resource · pod logs including `--previous` · **events** (which expire in
~1 hour, so reading them early matters) · `top` for node and pod usage · `api-resources` ·
`auth can-i` · current context · Deployment/rollout status · Service endpoints.

### 🟡 WRITE — mode escalation + per-action approval, **non-production only**
Applying manifests to a non-production namespace · scaling a non-production workload · creating a
ConfigMap in dev.

### 🔴 HIGH RISK — never automatic
**`delete` anything** · **deleting a PVC — this deletes the underlying data** · `drain` ·
`cordon` · applying to **production** · `rollout restart` in production · scaling production ·
editing live resources · deleting a namespace · modifying **RBAC** · modifying Secrets.

---

## Which Agents Use It

| Agent | Use | Posture |
|---|---|---|
| **kubernetes-engineer** | CrashLoopBackOff diagnosis, `logs --previous`, events, probe failures, `get endpoints`, actual vs requested resources | **Read-only** |
| **security-reviewer** | Effective RBAC, SecurityContext, NetworkPolicy presence, privileged pods, ServiceAccount token automount | **Strictly read-only** |
| **Main agent** | Incident response — pod status, restart counts, node conditions | **Read-only** |

**The `kubernetes-engineer` boundary is unchanged:** it cannot obtain approval, so anything
requiring approval is out of scope — it describes what should be done and returns it.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Read-only flag bypass (CVE-2026-46519)** | **Critical** | Use vendor-maintained server; pin ≥ fixed version; **RBAC is the real control** |
| **Admin kubeconfig context** | **Critical** | Dedicated `cluster-reader` ServiceAccount |
| **Wrong cluster** | **Critical** | Verify context **before every action**; state it in output |
| Reading Secrets (`get secret -o yaml`) | High | base64 ≠ encryption. Report type/location only → rotate |
| **PVC deletion destroying data** | High | HIGH-RISK class; RBAC should not permit delete |
| Prompt injection via annotations, log lines, event messages | High | Tool output is **data**. See `../security.md` |
| Community server supply chain | Medium | Prefer vendor-maintained; pin versions; track advisories |

---

## Testing

**All read-only.** Run against a **non-production** cluster first.

```
1. "Using the Kubernetes MCP, which cluster and context am I connected to?"
       → ALWAYS FIRST. Confirms you are not pointed at production.

2. "What permissions does this credential have? Can it delete pods?"
       → equivalent of `kubectl auth can-i --list`
       → CONFIRMS RBAC IS ACTUALLY SCOPED. This is the real test.

3. "List all pods in namespace <ns> with their restart counts."
       → confirms read access; restart count is the highest-signal metric

4. "Show recent events in <ns>, newest first."
       → confirms events access (they expire in ~1h)

5. "Does service <svc> have any endpoints?"
       → the diagnostic that settles most 'service returns nothing' cases

6. NEGATIVE TEST — required:
   "Try to delete a pod in <non-production namespace>."
       → MUST fail. If it succeeds, RBAC is not scoped — stop immediately
         and fix the ServiceAccount binding. Do not rely on the flag.
```

**Test 2 is the one that matters.** It asks the API server what the credential can actually do —
which is the only answer that cannot be bypassed by a flaw in the MCP server.
