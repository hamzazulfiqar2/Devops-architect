# Kubernetes — Cluster Architecture and Workloads

---

## Cluster Architecture

**Control plane** (managed by AWS on EKS — you do not run these):

| Component | Role |
|---|---|
| **API server** | The front door. Everything talks to it; it is the only thing that talks to etcd |
| **etcd** | The datastore holding all cluster state. **Back this up if self-managed** |
| **Scheduler** | Decides which node each new pod lands on |
| **Controller manager** | Runs the reconciliation loops (Deployment, ReplicaSet, Node, etc.) |
| **Cloud controller manager** | Provisions cloud resources — load balancers, volumes |

**Nodes** (you run these, unless using Fargate):

| Component | Role |
|---|---|
| **kubelet** | Agent that starts containers and reports node/pod health |
| **Container runtime** | containerd — actually runs the containers |
| **kube-proxy** | Implements Service networking on the node |
| **CNI plugin** | Pod networking. On EKS, the VPC CNI gives pods real VPC IPs |

**Practical consequences**
- The API server is the single point of contact. If it is unreachable, running workloads continue
  but nothing can change
- On EKS with the VPC CNI, **pods consume VPC subnet IPs** — a `/24` subnet limits pod density.
  Size subnets accordingly
- Node capacity is decided by **requests**, not actual usage. Inflated requests waste nodes
- Version upgrades are a recurring obligation — roughly annual on EKS, and deprecated APIs must be
  tracked before upgrading

---

## Pod

**What it is:** the smallest deployable unit — one or more containers sharing a network namespace
(same IP, same localhost) and optionally storage.

**Notes**
- Usually **one application container per pod**. Sidecars (log shippers, proxies) are the exception
- Pods are **disposable and mortal**. They get a new IP each time. Never treat one as a pet
- **Never create bare pods** — nothing recreates them when the node dies. Always use a controller
- Init containers run to completion before app containers start — useful for migrations and waiting
  on dependencies

---

## Choosing the Right Workload Object

| Object | Use for | Key property |
|---|---|---|
| **Deployment** | Stateless apps: APIs, web servers, workers | Interchangeable pods, rolling updates, easy rollback. **The default** |
| **ReplicaSet** | Never directly | Deployments manage these for you |
| **StatefulSet** | Databases, brokers — anything needing stable identity | Ordered names (`app-0`), stable DNS, per-pod storage, ordered rollout |
| **DaemonSet** | One pod per node: log shippers, node agents, CNI | Scales with nodes, not with load |
| **Job** | Run to completion: migrations, batch imports | Retries until success, then stops |
| **CronJob** | Scheduled work | Creates Jobs on a schedule |

**Workload shape alone decides this.** Long-running server → Deployment. Runs and exits → Job.
Scheduled → CronJob. One per node → DaemonSet. Needs stable identity and storage → StatefulSet.

---

## Deployment

**What it is:** manages a ReplicaSet, which manages pods. Handles rolling updates and rollback.

**Key fields**
- `replicas` — **`1` is not highly available.** Two minimum for anything that must stay up
- `strategy` — `RollingUpdate` (default) with `maxSurge` and `maxUnavailable`, or `Recreate`
- `revisionHistoryLimit` — how many old ReplicaSets are kept. **Rollback only works within this
  history**
- `selector` — immutable after creation, and **must match the pod template labels** or the
  Deployment owns nothing

**Rollout operations**
```
kubectl rollout status deployment/<name>     # does it actually finish?
kubectl rollout history deployment/<name>
kubectl rollout undo deployment/<name>       # rollback
```

**A rolling update is only zero-downtime if readiness probes are correct.** Without them,
Kubernetes sends traffic to pods that cannot serve.

---

## StatefulSet

**What it is:** for workloads needing stable network identity and per-pod persistent storage.

**Gives you:** predictable pod names (`db-0`, `db-1`) · stable DNS per pod via a headless Service ·
a PersistentVolumeClaim per pod · ordered creation, scaling, and rolling updates.

> **Prefer a managed database over a StatefulSet.** Running PostgreSQL in-cluster means you now own
> backups, failover, upgrades, and storage operations. Say this before anyone reaches for one, and
> compare against RDS.

**Notes:** deleting a StatefulSet does not delete its PVCs (deliberate — the data survives) ·
scaling down leaves PVCs behind · ordered rollouts are slow by design.

---

## DaemonSet

**What it is:** one pod per node (or per matching node).

**Use for:** log collection (Fluent Bit), monitoring agents, CNI plugins, node-level security tools.

**Notes:** scales with cluster size, not with load · usually needs tolerations to run on tainted
nodes · often requires elevated permissions — one of the few legitimate cases for `hostPath` or
privileged access, and it should be scoped as narrowly as the function permits.

---

## Job

**What it is:** runs pods until a specified number complete successfully, then stops.

**Use for:** database migrations, batch imports, one-off tasks.

**Key fields:** `backoffLimit` (retries before marking failed) · `activeDeadlineSeconds` (hard
timeout) · `ttlSecondsAfterFinished` (auto-cleanup — without it, completed Jobs accumulate) ·
`completions` and `parallelism` for parallel work.

**Notes:** the pod must exit 0 to count as complete · **Jobs are not idempotent by default** —
retries re-run your code, so migrations must be safe to run twice · a Job that never succeeds
retries until `backoffLimit`, then stays failed for inspection.

---

## CronJob

**What it is:** creates Jobs on a schedule.

**Fields that matter**
| Field | Why |
|---|---|
| `schedule` | Standard cron. **Runs in UTC unless `timeZone` is set** |
| `concurrencyPolicy` | `Forbid` is usually right — prevents overlapping runs when one takes too long |
| `startingDeadlineSeconds` | How long a missed run may still start |
| `successfulJobsHistoryLimit` / `failedJobsHistoryLimit` | **Unbounded history quietly fills the namespace** |
| `suspend` | Pause without deleting |

**Common mistakes:** no `concurrencyPolicy`, so a slow job overlaps itself · history limits unset ·
assuming local timezone · no alerting on failed runs, so a broken nightly job goes unnoticed for
weeks.

---

## Namespaces

**What it is:** a logical partition of cluster resources.

**Use for:** separating environments within one cluster (weigh against separate clusters),
separating teams or applications, applying ResourceQuotas and LimitRanges, scoping RBAC and
NetworkPolicies.

**Notes:** namespaces are **not** a hard security boundary — nodes, the control plane, and cluster
scoped resources are shared · DNS is namespace-aware (`<service>.<namespace>`) · never run
workloads in `default` · `kube-system` is the control plane's; do not put your workloads there.
