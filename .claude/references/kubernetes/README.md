# Kubernetes References — Index

| File | Covers |
|---|---|
| `cluster-and-workloads.md` | Cluster architecture, Pod, Deployment, ReplicaSet, StatefulSet, DaemonSet, Job, CronJob |
| `networking.md` | Service (ClusterIP/NodePort/LoadBalancer/ExternalName), Ingress, controllers, DNS, NetworkPolicy |
| `configuration-and-storage.md` | ConfigMap, Secret, Namespace, labels and selectors, PV, PVC, StorageClass |
| `reliability.md` | Liveness/readiness/startup probes, requests and limits, HPA, PDB, rollout strategies |
| `security.md` | RBAC, ServiceAccounts, SecurityContext, Pod Security Standards |
| `production-architecture.md` | What a production cluster actually needs |

---

## First: Is Kubernetes Warranted?

**Answer this before consulting anything else here.** Kubernetes is a distributed system you now
operate. An EKS control plane costs ~$73/month before a single node, and the concept load is the
larger bill.

**Kubernetes earns its place when:**
- Roughly five or more services with independent lifecycles and deploy cadences
- A team that already knows it, or genuinely needs to learn it
- Real multi-tenancy or hard workload-isolation requirements
- Portability across clouds is an actual constraint, not an aspiration
- Complex scheduling: DaemonSets, node affinity, GPU pools, spot handling
- Enough scale that bin-packing across nodes saves meaningful money

**Simpler alternatives, compared honestly:**

| Option | Gets you | Costs you |
|---|---|---|
| **ECS Fargate** | Containers, autoscaling, load balancing, no nodes to patch, no control-plane fee | AWS-specific, coarser scheduling |
| **App Runner** | Container to URL in one step, scale to zero | Least control, opinionated |
| **Lambda** | No servers, per-request billing, $0 idle | 15-min limit, cold starts, no long-lived connections |
| **EC2 + Compose** | Simplest, cheapest, fully understood | Manual scaling and patching, single point of failure |
| **Kubernetes** | Everything, uniformly, anywhere | Control-plane cost, upgrade treadmill, steep learning curve |

**If the project is one or two services run by one person, recommend ECS Fargate** — then say what
Kubernetes would add and the concrete threshold at which to revisit.

**Legitimate exception:** if learning Kubernetes is itself the goal, that is a real requirement.
Name it as learning-driven rather than requirement-driven, and start with **kind, minikube, or k3s**
locally before a paid cluster.

---

## The Mental Model

Kubernetes is a set of **controllers** running reconciliation loops. You declare desired state; a
controller continuously works to make reality match. Nothing is imperative — `kubectl apply`
records intent, and a controller acts on it.

This explains most behavior:
- Delete a pod managed by a Deployment and it comes straight back
- A `Pending` pod is not an error; it is the scheduler unable to satisfy your declaration yet
- Changing a ConfigMap does not restart pods, because nothing declared that it should

**Labels and selectors are how almost everything connects.** A Service finds pods by label. A
Deployment owns pods by label. A label/selector mismatch is the single most common reason something
silently routes to nothing.

---

## Cross-Cutting Rules

- Never `:latest` — deploys and rollbacks become non-deterministic
- Resource requests and limits on every container, or the scheduler is blind and HPA cannot work
- Readiness probes on everything that serves traffic, or rolling updates drop requests
- `replicas: 1` is not highly available
- Secrets are base64-**encoded**, not encrypted — use an external store
- Every workload gets its own ServiceAccount; never `default`
- Without a NetworkPolicy, every pod can reach every other pod
- Prefer a managed database over a StatefulSet
