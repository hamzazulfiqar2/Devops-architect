---
name: kubernetes
description: Design, review, troubleshoot, and explain Kubernetes workloads. Covers pods, namespaces, labels and selectors, Deployments, StatefulSets, DaemonSets, Jobs and CronJobs, Services (ClusterIP/NodePort/LoadBalancer/ExternalName), Ingress and ingress controllers, DNS, NetworkPolicy, ConfigMaps and Secrets, volumes, PV/PVC/StorageClass, liveness/readiness/startup probes, resource requests and limits, HPA, PodDisruptionBudgets, rolling updates and rollbacks, RBAC, ServiceAccounts, SecurityContext, and kubectl troubleshooting for CrashLoopBackOff, ImagePullBackOff, Pending pods, readiness failures, and networking problems. Generates production-ready YAML with every section explained, and audits existing manifests for anti-patterns. Also evaluates whether Kubernetes is warranted at all, comparing it against simpler alternatives. Use when the user mentions Kubernetes, k8s, kubectl, pods, Deployments, Helm, EKS workloads, or manifests.
---

# Kubernetes

Understand the application first. Recommend the smallest set of objects that meets its needs.
Explain why each one exists.

## Gate: Does This Project Need Kubernetes?

**Answer this before writing a single manifest.** Kubernetes is a distributed system you now
operate. It buys real capability and charges real complexity — an EKS control plane costs
~$73/month before a single node, and the concept load is the larger bill.

**Kubernetes earns its place when:**
- Many services (roughly 5+) with independent lifecycles and deploy cadences
- A team that already knows it, or genuinely needs to learn it for their trajectory
- Real multi-tenancy, or hard workload-isolation requirements
- Portability across clouds or on-prem is an actual constraint, not an aspiration
- Complex scheduling needs: DaemonSets, node affinity, GPU pools, spot handling
- Enough scale that bin-packing across nodes saves meaningful money

**Simpler alternatives to compare against, honestly:**

| Option | Gets you | Costs you |
|---|---|---|
| **ECS Fargate** | Containers, autoscaling, load balancing, no nodes to patch, no control-plane fee | AWS-specific, less ecosystem, coarser scheduling |
| **App Runner / Cloud Run** | Container to URL in one step, scale-to-zero | Least control, opinionated |
| **Lambda** | No servers, per-request billing, zero idle cost | 15-min limit, cold starts, no long-lived connections |
| **EC2 + Docker Compose** | Dead simple, cheapest, fully understood | Manual scaling, manual patching, single point of failure |
| **Kubernetes** | Everything, uniformly, anywhere | Control plane cost, upgrade treadmill, steep learning curve |

**If the project is one or two services run by one person who is learning, say so plainly and
recommend ECS Fargate instead** — then explain what Kubernetes would have added and the
concrete threshold (service count, team size, portability requirement) at which to revisit.

**Exception worth naming:** if the user's goal is *learning Kubernetes*, that is a legitimate
requirement. Say the architecture is learning-driven rather than requirement-driven, and
suggest a cheap practice environment (kind, minikube, k3s locally) before a paid EKS cluster.

Never introduce Kubernetes by reflex. An unnecessary cluster is a design flaw, not a hedge.

## Before You Recommend Objects

Establish these — from the repo, a completed `project-discovery`, or by asking:

- **Workload shape** — long-running server, batch job, scheduled task, or per-node agent?
  This alone determines Deployment vs Job vs CronJob vs DaemonSet.
- **Stateless or stateful** — does any instance hold data or identity that must persist?
- **Replica count** and whether instances can run concurrently.
- **Ports and protocols**, and what must be reachable from outside the cluster.
- **Configuration and secrets** — every variable, and which are sensitive.
- **Storage** — what is written, how much, whether it must survive a pod restart, and whether
  multiple pods write to it simultaneously (that constrains the access mode).
- **Health signals** — is there an endpoint that proves the app can serve? How long does the
  app take to become ready?
- **Resource appetite** — real CPU and memory usage, ideally measured, not guessed.
- **Startup dependencies** — databases, migrations, other services.
- **Cluster context** — managed (EKS/GKE) or self-run, version, existing ingress controller,
  existing storage classes, node types.

If something here is unknown and it changes the manifest, **ask**. Never invent a memory limit
or a probe path.

## Boundaries

- **Never deploy to production without explicit approval**, per deploy. `kubectl apply` against
  a production context, `helm upgrade`, `rollout restart`, or scaling production all require a
  fresh yes. Show the diff (`kubectl diff -f`) first.
- **Never run destructive commands without approval** — `kubectl delete` on anything, `drain`,
  `cordon`, deleting PVCs (this deletes data), namespace deletion, or editing live resources.
- **Never modify files without approval.** Propose manifests, explain them, wait.
- **Confirm the context before any command.** `kubectl config current-context` first. Acting on
  the wrong cluster is the classic catastrophic Kubernetes mistake.
- **Cluster architecture stays with `aws-architecture`** — EKS vs alternatives, node groups,
  VPC design, cluster sizing. This skill covers what runs *inside* a cluster.
- **Image and Dockerfile concerns stay with `docker`.**

## Teaching Mode

Define each object in one plain sentence the first time it appears, and use everyday analogies.
When asked for `Roman Urdu` (or `samjhao` / `Urdu mein`), give the explanation in simple Roman
Urdu with technical terms kept in English — *"Pod ek chhota sa dabba hai jis mein aap ka
container chalta hai. Agar pod mar jaye, Deployment turant naya bana deta hai."*

Quick glossary to reuse:

- **Cluster** — a pool of machines Kubernetes manages as one. A factory.
- **Node** — one machine in the pool. A workbench.
- **Pod** — the smallest deployable unit: one or more containers sharing a network and storage.
  Usually one app container. Pods are disposable — never treat one as a pet.
- **Namespace** — a folder that partitions resources, for isolation and quotas.
- **Label** — a key/value sticker on an object. **Selector** — a query that finds objects by
  their stickers. This pairing is how nearly everything in Kubernetes connects, and a
  label/selector mismatch is the single most common reason "my Service returns nothing".
- **Controller** — a loop that keeps reality matching what you declared. You declare desired
  state; Kubernetes converges toward it.

## Workloads — Pick the Right One

| Object | Use for | Key property |
|---|---|---|
| **Deployment** | Stateless apps: APIs, web servers, workers | Interchangeable pods, rolling updates, easy rollback. **The default.** |
| **ReplicaSet** | Never directly | Deployments manage these for you |
| **StatefulSet** | Databases, brokers, anything needing stable identity | Ordered names (`app-0`, `app-1`), stable DNS, per-pod storage, ordered rollout |
| **DaemonSet** | One pod per node: log shippers, node agents, CNI | Scales with nodes, not with load |
| **Job** | Run to completion: migrations, batch imports | Retries until success, then stops |
| **CronJob** | Scheduled work | Creates Jobs on a schedule |

**Prefer a managed database over a StatefulSet.** Running Postgres in Kubernetes means you own
backups, failover, upgrades, and storage — say this out loud before anyone reaches for a
StatefulSet, and compare against RDS.

**CronJob details that matter:** set `concurrencyPolicy` (usually `Forbid`), `startingDeadlineSeconds`,
and both history limits — unbounded history quietly fills the namespace. Schedules run in the
cluster's timezone unless `timeZone` is set.

## Networking

**Service** — a stable name and IP in front of a changing set of pods. Pods die and get new IPs;
the Service does not. It finds its pods **by label selector**.

| Type | Reach | Use |
|---|---|---|
| **ClusterIP** | Inside the cluster only | The default; internal service-to-service |
| **NodePort** | A high port on every node | Rarely useful directly; mostly a building block |
| **LoadBalancer** | External, provisions a cloud LB | One cloud load balancer per Service — costly if repeated |
| **ExternalName** | Maps a name to an external DNS record | Point at a managed database without hardcoding hosts |

**Ingress** — HTTP/HTTPS routing by host and path, terminating TLS, in front of many Services.
Use it instead of a LoadBalancer per service; that consolidation is the cost argument. Ingress
is only rules — an **Ingress Controller** (AWS Load Balancer Controller, NGINX, Traefik) must be
running to enforce them. An Ingress with no controller does nothing, silently.

**DNS** — every Service gets `<service>.<namespace>.svc.cluster.local`. Within a namespace, the
short name works. Cross-namespace needs `<service>.<namespace>`.

**NetworkPolicy** — a pod firewall. **Without any policy, every pod can talk to every other pod.**
Start with a default-deny ingress policy per namespace and open specific paths. Requires a CNI
that enforces policies — verify before promising isolation.

## Configuration and Storage

**ConfigMap** — non-sensitive config, as env vars or mounted files.
**Secret** — sensitive values. **Base64 is encoding, not encryption** — say this every time; a
Secret in git is a plaintext leak. Enable encryption at rest and prefer an external store
(AWS Secrets Manager via the Secrets Store CSI driver, or External Secrets Operator).

Mounted ConfigMaps update in place; env vars do **not** — changing a ConfigMap consumed as env
vars requires a pod restart. Pods don't reload on their own; a checksum annotation on the pod
template is the standard trick to force a rollout when config changes.

**Volumes** — `emptyDir` (scratch, dies with the pod), `configMap`/`secret` (config as files),
`persistentVolumeClaim` (durable storage).

**PV / PVC / StorageClass** — a PVC is a *request* for storage; a PV is the actual storage; a
StorageClass provisions PVs on demand. Access modes matter: `ReadWriteOnce` (one node — what
EBS gives you), `ReadWriteMany` (many nodes — needs EFS or similar). If two pods must write the
same volume, `ReadWriteOnce` will not do it. Set `reclaimPolicy` deliberately: **deleting a PVC
can delete the data.**

## Reliability

**Probes** — three, with distinct jobs. Getting these wrong causes more outages than getting
them missing.

- **Startup probe** — "has it finished booting?" Suppresses the other two until it passes. Use
  for slow starters; it prevents liveness from killing an app that is merely still warming up.
- **Readiness probe** — "should it receive traffic *right now*?" Failing removes the pod from
  Service endpoints without restarting it. This is the one that makes zero-downtime deploys work.
- **Liveness probe** — "is it wedged and beyond recovery?" Failing **restarts the container**.

Rules: liveness must be cheap and must not check downstream dependencies — a database blip
should not restart every pod cluster-wide. Readiness may check dependencies. Tune `periodSeconds`,
`failureThreshold`, and `timeoutSeconds` deliberately; the defaults are aggressive for slow apps.
Never point liveness at a heavyweight endpoint.

**Requests and limits** — a request is what the scheduler reserves; a limit is the hard ceiling.

- **Memory over limit → OOMKilled**, immediately. Memory is incompressible.
- **CPU over limit → throttled**, not killed. Aggressive CPU limits cause mysterious latency.
- **No requests** → the scheduler is flying blind and nodes get overcommitted.
- Requests ≈ observed steady usage; memory limit ≈ observed peak plus headroom. Setting
  requests = limits for memory gives the Guaranteed QoS class and the best eviction protection.
- **Recommend measuring before setting.** If no data exists, propose conservative starting
  values, label them explicitly as starting points, and say how to observe and correct them.
  Never present a guessed limit as a recommendation.

**HPA** — scales replica count on CPU, memory, or custom metrics. Needs metrics-server and
**needs resource requests set**, or it cannot compute utilization. Set sensible min/max and
be aware of the stabilization window on scale-down. HPA scales pods; a Cluster Autoscaler is
what adds nodes — both are needed for scaling to actually work.

**Disruption** — a **PodDisruptionBudget** protects availability during voluntary disruptions
(node drains, upgrades). Without one, a drain can take every replica down at once. Pair with
`topologySpreadConstraints` or anti-affinity so replicas don't all land on one node, and with
`terminationGracePeriodSeconds` plus a `preStop` hook so in-flight requests finish.

## Deployment Strategies

- **RollingUpdate** (default) — replaces pods gradually. Tune `maxSurge` and `maxUnavailable`.
  Zero-downtime only if readiness probes are correct.
- **Recreate** — stops everything, then starts new. Causes downtime. Necessary when old and new
  versions cannot coexist (incompatible schema, `ReadWriteOnce` volume handoff).
- Blue/green and canary need extra tooling (Argo Rollouts, service mesh, or two Deployments plus
  Ingress weighting) — name that cost rather than implying they're built in.

Operate with `kubectl rollout status`, `rollout history`, and `rollout undo`. Rollback only
works if revision history is retained — `revisionHistoryLimit` controls that. **Rollback does
not undo database migrations**; say so whenever a migration is in the picture.

Use immutable image tags. `:latest` makes rollout and rollback non-deterministic.

## Security

- **ServiceAccount** — a pod's identity. Every pod gets `default` unless told otherwise; give
  each workload its own and set `automountServiceAccountToken: false` when it needs no API access.
- **RBAC** — Role/RoleBinding (namespaced) and ClusterRole/ClusterRoleBinding (cluster-wide).
  Grant the narrowest verbs on the narrowest resources. Never bind `cluster-admin` to a workload.
- **SecurityContext** — `runAsNonRoot: true`, an explicit `runAsUser`, `allowPrivilegeEscalation: false`,
  `readOnlyRootFilesystem: true`, and `capabilities: drop: [ALL]`. Set at pod and container level.
- **Pod security** — enforce Pod Security Standards (`restricted` where possible) at the namespace
  level. Never `privileged: true`, never `hostNetwork`/`hostPID`, no host path mounts, without a
  named justification.
- **Secrets** — external store preferred, encryption at rest enabled, never in git, RBAC-restricted.
- **NetworkPolicy** — default-deny, then allow explicitly.
- **Images** — pinned digests where integrity matters, scanned, pulled from a trusted registry.

## Reviewing Existing Manifests — Anti-Patterns

Report findings ranked by severity, each with the file, the line, the impact, and the fix.

| Anti-pattern | Why it hurts |
|---|---|
| `image: :latest` or unpinned | Non-deterministic rollouts, impossible rollback |
| No resource requests/limits | Scheduler blind, noisy neighbors, OOM roulette, HPA can't work |
| Missing readiness probe | Traffic to pods that can't serve; rolling updates drop requests |
| Liveness probe checking dependencies | One database blip restarts the entire fleet |
| Liveness with no startup probe on a slow app | Restart loop that never lets the app boot |
| Secrets in manifests or git | Plaintext credential leak (base64 ≠ encryption) |
| `replicas: 1` for something called highly available | Every update and node drain is an outage |
| No PodDisruptionBudget | Node drain takes all replicas at once |
| Running as root, no SecurityContext | Container escape severity multiplied |
| Overly broad RBAC / `cluster-admin` | Compromise of one pod compromises the cluster |
| Label/selector mismatch | Service silently routes to nothing |
| `hostPath` volumes | Ties pods to nodes, escalates host access |
| No namespace / everything in `default` | No isolation, no quotas, no blast-radius control |
| StatefulSet for something stateless | Slow ordered rollouts for no benefit |
| Database in-cluster without a deliberate decision | You now own backups, failover, and upgrades |
| No `terminationGracePeriod` / `preStop` handling | In-flight requests dropped on every deploy |
| ConfigMap changed without triggering a rollout | Pods keep running the old config |
| Bare pods (no controller) | Nothing recreates them when the node dies |

## Generating YAML

When manifests are warranted, produce complete, production-ready YAML — and **explain every
important section inline or immediately after**. Include, as the workload requires:

Namespace · Deployment (or the right workload kind) · Service · Ingress · ConfigMap · Secret
reference (never literal values) · ServiceAccount · PVC · HPA · PDB · NetworkPolicy

Always set: resource requests and limits, all appropriate probes, SecurityContext,
`revisionHistoryLimit`, rollout strategy parameters, labels following the
`app.kubernetes.io/*` convention, and a named ServiceAccount.

Never emit placeholder secrets, `:latest` tags, or `TODO` values presented as ready to apply.
State clearly which values the user must supply.

Explain the YAML in the structure: **what this block does → why it's here for this app → what
breaks without it.**

Mention Helm or Kustomize when there are multiple environments, and explain the trade-off
rather than assuming one.

## Troubleshooting Playbook

**Always start with:** `kubectl config current-context`, then `kubectl get pods -n <ns>`, then
`kubectl describe pod <pod>` (read the **Events** at the bottom — the answer is usually there),
then `kubectl logs <pod>` (add `--previous` for a crashed container).

**CrashLoopBackOff** — the container starts and dies repeatedly. `kubectl logs --previous` is
the first move. Causes: application error on boot, missing required env var or secret, wrong
command, failing liveness probe, OOMKilled (check `describe` for the reason and exit code 137),
or a dependency not reachable yet.

**ImagePullBackOff / ErrImagePull** — the image can't be fetched. Check the tag exists, the
registry path is right, `imagePullSecrets` are present for a private registry, the node has
network egress to the registry (in a private subnet this often means a missing VPC endpoint or
NAT route), and that the architecture matches.

**Pending** — the pod isn't scheduled. `describe` says why: insufficient CPU/memory on any node,
no node matching affinity or a taint that isn't tolerated, or an unbound PVC (no matching
StorageClass, or `ReadWriteOnce` already attached elsewhere).

**Running but not Ready** — the readiness probe fails. Check the path, port, and scheme; check
whether the app binds `0.0.0.0`; check whether `initialDelaySeconds` is too short; `kubectl exec`
in and curl the endpoint yourself.

**Terminating forever** — a finalizer, or a process ignoring SIGTERM until the grace period expires.

**Service returns nothing** — `kubectl get endpoints <svc>`. Empty endpoints means the selector
matches no ready pods: either the labels don't match, or no pod is passing readiness.

**Cross-pod networking fails** — check the DNS name form, check NetworkPolicies (a default-deny
you forgot about), check the Service port vs the container's `targetPort`, and test from inside
a pod rather than reasoning about it.

**OOMKilled** — memory limit too low or a genuine leak. Check actual usage before raising it.

**Node issues** — `kubectl get nodes`, `kubectl describe node`, `kubectl top nodes/pods`.
Look for `DiskPressure`, `MemoryPressure`, and `NotReady`.

Useful commands: `kubectl get events --sort-by=.lastTimestamp`, `kubectl logs -f --tail=100`,
`kubectl exec -it <pod> -- sh`, `kubectl port-forward`, `kubectl top`, `kubectl get all -n <ns>`,
`kubectl rollout status`, `kubectl diff -f`, `kubectl explain <resource>.<field>`.

## Working Style

- **Always say why an object is being used** — what requirement it satisfies and what breaks
  without it. Never present a manifest as self-evident.
- Recommend the fewest objects that meet the requirement. Every object is something to maintain.
- Distinguish measured facts from starting-point guesses, especially for resources and probes.
- Be blunt about cost and operational burden.
- Teach as you go: plain-English definitions first use, Roman Urdu on request.
- Verify before deploying: `kubectl apply --dry-run=server`, `kubectl diff -f`, then a staging
  namespace, then **stop and ask** before production.
