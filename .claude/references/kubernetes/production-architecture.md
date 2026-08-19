# Kubernetes — Production Architecture

What a cluster actually needs before real users depend on it. **A cluster that runs pods is not a
production cluster.**

---

## Cluster Design

| Decision | Guidance |
|---|---|
| **Cluster per environment?** | Separate clusters give the strongest isolation and the clearest blast radius, at ~$73/mo each on EKS. Namespaces are cheaper but share the control plane, nodes, and cluster-scoped resources. For a small setup, **one cluster with namespaces for dev/staging and a separate cluster for production** is a defensible middle ground |
| **Node groups** | Managed node groups are the simple choice. **Karpenter** gives better bin-packing and much faster scale-up. Fargate profiles remove node management entirely, at a price premium |
| **AZ spread** | Nodes across at least two AZs, or an AZ failure takes the cluster |
| **Subnet sizing** | On EKS the VPC CNI gives pods **real VPC IPs** — pods consume subnet addresses. Size subnets for peak pod count, not node count |
| **Version policy** | Upgrades are roughly annual and mandatory. Track deprecated APIs before upgrading; test in a non-production cluster first |

---

## What Every Production Workload Needs

Nothing on this list is optional if real users depend on the service.

| Item | Why |
|---|---|
| `replicas: 2` minimum | One replica means every node drain and every update is an outage |
| **Resource requests and limits** | Scheduler needs requests; limits prevent one pod starving the node |
| **Readiness probe** | Without it, rolling updates drop requests |
| Liveness probe (cheap, no dependency checks) | Restarts genuinely wedged containers — and nothing else |
| Startup probe if boot is slow | Prevents a restart loop that never lets the app start |
| **PodDisruptionBudget** | Stops a node drain taking every replica at once |
| `topologySpreadConstraints` or anti-affinity | Replicas on different nodes and AZs |
| `terminationGracePeriodSeconds` + `preStop` | In-flight requests finish instead of being dropped |
| **Immutable image tag** (git SHA) | Deterministic deploys and real rollback |
| SecurityContext hardened | `runAsNonRoot`, no privilege escalation, capabilities dropped |
| Named ServiceAccount, minimal RBAC | Limits what a compromised pod can do |
| `revisionHistoryLimit` set | Rollback only works within retained history |
| Standard `app.kubernetes.io/*` labels | Tooling, dashboards, and selectors depend on them |

---

## Cluster Add-Ons

A bare EKS cluster is missing most of what production needs. Typical set:

| Add-on | Purpose | Needed when |
|---|---|---|
| **AWS Load Balancer Controller** | Provisions ALBs for Ingress | Any external HTTP traffic |
| **EBS CSI driver** | Dynamic persistent volumes | Any PVC on EBS |
| **EFS CSI driver** | `ReadWriteMany` volumes | Shared filesystem needed |
| **metrics-server** | Resource metrics | **Required for HPA and `kubectl top`** |
| **Cluster Autoscaler or Karpenter** | Adds and removes nodes | Any autoscaling — HPA alone only scales pods |
| **ExternalDNS** | Creates Route 53 records from Ingress | Automating DNS |
| **cert-manager** | Certificate lifecycle | TLS certificates managed in-cluster |
| **Secrets Store CSI driver** or **External Secrets Operator** | Secrets from AWS Secrets Manager | Any real secret management |
| **Fluent Bit** | Ships logs to CloudWatch | Always |
| **Container Insights** or Prometheus/Grafana | Metrics and dashboards | Always |

Each add-on is something to configure, upgrade, and debug. **Add what a requirement forces, not
the full list.**

---

## Observability

**The Kubernetes-specific signals that matter most:**

| Signal | Why it matters |
|---|---|
| **Pod restart count** | The single most informative signal. A rising count precedes most visible outages |
| Deployment available vs desired replicas | A rollout stuck partway |
| **Usage against requests** | Scheduling accuracy — inflated requests waste nodes |
| **Usage against limits** | OOM risk and CPU throttling |
| **CPU throttling** | Invisible unless you look for it. Causes latency that looks like a code problem |
| Node conditions | `MemoryPressure`, `DiskPressure`, `NotReady` |
| Pending pod count | Scheduler cannot place work — capacity or constraint problem |
| **Events** | `kubectl get events` — but they **expire after ~1 hour**, so ship them if you want post-incident forensics |

Plus the standard golden signals per service: latency p95/p99, error rate, traffic, saturation.

**Logging:** Fluent Bit → CloudWatch, structured JSON, correlation IDs, **retention set on every
log group**. A pod's logs vanish with the pod — centralization is not optional.

---

## Deployment and Rollback

- **Build once, promote the same image digest** through environments
- Immutable SHA tags; `:latest` makes rollback guesswork
- `kubectl rollout status` in the pipeline — **without it, a deploy reports success while pods
  crash-loop**
- `kubectl rollout undo` for rollback, within `revisionHistoryLimit`
- **Rollback does not undo database migrations** — they must be backward-compatible with the
  previous version
- **Practise rollback in staging before you need it in production**

**Multi-environment configuration:** Kustomize overlays (simpler, template-free) or Helm (packaging,
versioning, release lifecycle, at the cost of templating complexity). Pick deliberately and explain
the trade-off.

---

## Production Readiness Checklist

| Area | Requirement |
|---|---|
| Availability | ≥2 replicas · multi-AZ nodes · PDB · spread constraints |
| Resources | Requests and limits from **measured** usage · no recent OOM kills |
| Probes | Readiness always · liveness cheap and dependency-free · startup if slow to boot |
| Scaling | HPA configured **and** Cluster Autoscaler/Karpenter present · sane min/max |
| Security | Non-root · SecurityContext hardened · scoped RBAC · own ServiceAccount · NetworkPolicy · external secret store · etcd encryption |
| Storage | Correct access mode · reclaim policy deliberate · **backups for anything stateful** |
| Networking | Ingress controller running · TLS valid and monitored · no NodePort to the internet |
| Observability | Logs centralized with retention · metrics · alerts on restarts, pending pods, and error rate |
| Deployment | Immutable tags · rollout status gate · **practised rollback** · backward-compatible migrations |
| Cluster | Version supported · upgrade plan · add-ons pinned and upgraded together |

---

## Common Production Mistakes

- **`replicas: 1` on something described as highly available**
- No PDB, so a routine node drain during an upgrade causes an outage
- Liveness probe checking the database — one blip restarts the entire fleet
- Resource requests copied from another service, so nodes run at 20% utilization and cost triple
- HPA configured without Cluster Autoscaler — pods sit `Pending` and nothing scales
- No `preStop` or grace handling, so every deploy drops in-flight requests
- Running a database in-cluster without deciding to own backups, failover, and upgrades
- Secrets in git, or in-cluster Secrets with no etcd encryption
- No NetworkPolicy, so a compromised pod reaches everything
- Events not shipped, so post-incident investigation has nothing to look at
