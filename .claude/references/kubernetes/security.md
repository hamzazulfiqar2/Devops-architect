# Kubernetes — Security

**The guiding question: what could an attacker do with one compromised pod?**

---

## ServiceAccounts

**What it is:** a pod's identity to the Kubernetes API. Every pod gets one — `default` if you do not
specify.

**Rules**
- **Every workload gets its own ServiceAccount.** Never `default` — the default SA is shared by
  everything in the namespace, so any permission granted to it is granted to all of them
- **`automountServiceAccountToken: false`** where the pod makes no Kubernetes API calls. Most
  application pods do not. This removes a credential from the container entirely
- On EKS, bind the ServiceAccount to an IAM role via **IRSA** or **Pod Identity** for AWS access —
  never static AWS keys in a Secret

**The token is mounted at a known path inside the pod.** Anyone who achieves code execution in the
container has it. That is why its permissions matter so much.

---

## RBAC

**What it is:** who may perform which verbs on which resources.

| Object | Scope |
|---|---|
| **Role** | Permissions within one namespace |
| **RoleBinding** | Grants a Role to a subject in one namespace |
| **ClusterRole** | Cluster-wide permissions, or reusable across namespaces |
| **ClusterRoleBinding** | Grants cluster-wide |

**Rules**
- **Never bind `cluster-admin` to a workload.** Ever
- Prefer namespaced `Role` over `ClusterRole` wherever the scope allows
- No wildcard verbs or resources without written justification
- Watch escalation paths: `create pods` in a namespace lets someone run a pod as any ServiceAccount
  in it · `get secrets` reads every credential in the namespace · `escalate` and `bind` allow
  granting more than you hold
- Check the `system:masters` group and EKS **access entries** — membership there bypasses RBAC
  entirely

**The review question:** *if this pod were compromised, what could the attacker do with its
ServiceAccount token?* If the answer includes reading secrets, creating pods, or touching other
namespaces, tighten it.

```bash
kubectl auth can-i --list --as=system:serviceaccount:<ns>:<sa>
```

---

## SecurityContext

Set at pod level and container level; container level wins.

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: <uid>
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop: [ALL]
  seccompProfile:
    type: RuntimeDefault
```

| Setting | What it prevents |
|---|---|
| `runAsNonRoot` + `runAsUser` | Container escape landing as root on the host |
| `allowPrivilegeEscalation: false` | setuid binaries gaining privileges |
| `readOnlyRootFilesystem: true` | Attackers writing tools or payloads into the container |
| `capabilities: drop: [ALL]` | Linux capabilities the app does not need |
| `seccompProfile: RuntimeDefault` | Dangerous syscalls |

**Notes:** `readOnlyRootFilesystem` needs an `emptyDir` mounted anywhere the app legitimately writes
(temp files, caches) · the image should already have a `USER` instruction — `runAsNonRoot` enforces
it rather than replacing it · add back only capabilities you can prove are needed (`NET_BIND_SERVICE`
if the app must bind below port 1024 — better to listen above 1024 instead).

---

## Pod Security

**Never, without a named justification:**

| Setting | Why it is dangerous |
|---|---|
| `privileged: true` | Effectively root on the node |
| `hostNetwork: true` | Pod shares the node's network — bypasses NetworkPolicy, reaches node-local services |
| `hostPID` / `hostIPC` | Sees and signals node processes |
| `hostPath` mounts | Reads or writes the node filesystem. `/var/run/docker.sock` or the containerd socket is **root on the host — CRITICAL** |

**Legitimate cases exist** — CNI plugins, node agents, log collectors mounting `/var/log`. Application
workloads almost never qualify.

### Pod Security Standards

Enforced at the **namespace** level via labels, replacing the old PodSecurityPolicy:

| Level | Meaning |
|---|---|
| `privileged` | No restrictions |
| `baseline` | Blocks known privilege escalations |
| `restricted` | Hardened — non-root, dropped capabilities, seccomp |

```yaml
labels:
  pod-security.kubernetes.io/enforce: restricted
  pod-security.kubernetes.io/warn: restricted
```

Target `restricted` for application namespaces. Use `warn` first to see what would break before
enforcing.

---

## Secrets

> **Base64 is encoding, not encryption.** Say this every time it comes up.

- **Enable encryption at rest for etcd** — on EKS, KMS envelope encryption
- **RBAC on secret reads is a real control** — `get secrets` in a namespace reads every credential
  in it
- **Prefer an external store**: AWS Secrets Manager via the **Secrets Store CSI driver**, or the
  **External Secrets Operator**. The secret then lives with IAM control, audit trail, and rotation
- Never commit manifests containing real secret values
- Mounted secrets update in place; env-var secrets require a pod restart

---

## Images and Supply Chain

- **Pin image tags** — never `:latest`. With `imagePullPolicy: Always`, a pod restart can silently
  change versions
- Pin by **digest** where integrity matters
- Scan images in CI before they reach the registry; ECR scan-on-push as a second net
- Minimal base images — every package is attack surface
- Pull only from trusted registries; consider an admission policy enforcing that

---

## NetworkPolicy

**Without a NetworkPolicy, every pod can reach every other pod** — a compromised frontend can talk
directly to a database pod.

1. Default-deny ingress per namespace
2. Explicit allow rules for traffic that should exist
3. **Allow egress to kube-dns** if you also default-deny egress, or all name resolution breaks

**Verify your CNI enforces policies.** An unenforced NetworkPolicy looks correct and does nothing.

---

## Review Checklist

| Check | Severity if violated |
|---|---|
| `cluster-admin` bound to a workload | **CRITICAL** |
| Docker/containerd socket mounted into a container | **CRITICAL** |
| `privileged: true` on an application workload | **HIGH** |
| Real secret values committed to git | **CRITICAL** |
| `hostNetwork` / `hostPID` / `hostPath` without justification | **HIGH** |
| Wildcard verbs or resources in RBAC | **HIGH** |
| No etcd encryption at rest | **HIGH** |
| Running as root, no SecurityContext | **MEDIUM** |
| `default` ServiceAccount in use | **MEDIUM** |
| No NetworkPolicy (flat pod network) | **MEDIUM** |
| `automountServiceAccountToken` on where unneeded | **LOW–MEDIUM** |
| No `readOnlyRootFilesystem` | **LOW** |
