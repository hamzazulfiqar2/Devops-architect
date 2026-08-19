# Kubernetes — Reliability

Probes, resources, autoscaling, and disruption. **Getting probes and resources wrong causes more
outages than getting them missing.**

---

## Probes

Three probes, with genuinely distinct jobs. The difference is **what failure does**.

| Probe | Question | On failure |
|---|---|---|
| **Startup** | "Has it finished booting?" | Keeps waiting. **Suppresses the other two until it passes** |
| **Readiness** | "Should it receive traffic *right now*?" | **Removes the pod from Service endpoints.** Does not restart |
| **Liveness** | "Is it wedged beyond recovery?" | **Restarts the container** |

### Readiness — the one that makes zero-downtime deploys work

Without a correct readiness probe, a rolling update sends traffic to pods that are still starting,
and requests fail during every deploy. Readiness *may* check dependencies — a pod that cannot reach
its database arguably should not receive traffic.

### Liveness — the one that causes outages when wrong

**Liveness must be cheap and must NOT check downstream dependencies.** If liveness checks the
database, a brief database blip restarts every pod in the cluster simultaneously — turning a small
problem into a total outage. Point it at a trivial endpoint that proves the process is responsive.

**Consider not setting a liveness probe at all** if the application does not actually get wedged. A
missing liveness probe is safer than an aggressive one.

### Startup — for slow starters

An application that takes 90 seconds to boot, with a liveness probe expecting a response in 10,
will restart forever and never start. A startup probe with a generous `failureThreshold` solves
this cleanly — better than inflating `initialDelaySeconds` on liveness.

### Tuning

| Field | Meaning | Common error |
|---|---|---|
| `initialDelaySeconds` | Wait before first check | Too short for real startup time |
| `periodSeconds` | How often | Too frequent on an expensive endpoint |
| `timeoutSeconds` | How long to wait for a response | Default 1s is often too tight |
| `failureThreshold` | Consecutive failures before acting | Too low causes flapping |

**The endpoint must verify serving capability, not just that the process is alive.** A handler that
returns `200 OK` unconditionally is not a health check.

---

## Resource Requests and Limits

| | Meaning |
|---|---|
| **Request** | What the scheduler **reserves**. Decides which node the pod lands on and how nodes are packed |
| **Limit** | The hard ceiling at runtime |

### The two behaviors that differ

| Resource | Over limit | Consequence |
|---|---|---|
| **Memory** | **OOMKilled immediately** | Container restarts. Memory is incompressible |
| **CPU** | **Throttled** | Not killed — just slow. Causes mysterious latency that looks like a code problem |

**A CPU-throttled container shows *low* CPU usage while being slow.** Check throttling metrics
before concluding the application is fine.

### Setting values

- **Requests ≈ observed steady usage.** Limits ≈ observed peak plus headroom
- **Measure first.** `kubectl top`, or metrics over a real workload. If no data exists, propose
  conservative starting values, **label them explicitly as starting points**, and say how to
  observe and correct them. Never present a guess as a recommendation
- Setting `requests == limits` for memory gives the **Guaranteed** QoS class and the best protection
  from eviction
- **Inflated requests are the biggest source of wasted cluster cost** — they decide bin-packing, so
  over-requesting means paying for nodes to hold air
- **No requests at all** means the scheduler is blind, nodes get overcommitted, and HPA cannot
  compute utilization

### QoS classes

| Class | When | Eviction order |
|---|---|---|
| **Guaranteed** | requests == limits for all resources | Last to be evicted |
| **Burstable** | requests < limits | Middle |
| **BestEffort** | Nothing set | **First to be evicted** |

---

## Horizontal Pod Autoscaler (HPA)

**What it is:** scales replica count based on CPU, memory, or custom metrics.

**Requirements**
- **metrics-server** must be installed
- **Resource requests must be set**, or HPA cannot compute utilization and will do nothing

**Configuration**
- Sensible `minReplicas` (at least 2 for availability) and `maxReplicas` (a real ceiling, so a bug
  or traffic spike cannot become an unbounded bill)
- Target utilization is a percentage **of requests**, not of node capacity
- Scale-down has a stabilization window (default 5 minutes) to prevent flapping
- Custom or external metrics (queue depth, requests per second) often reflect real load better than
  CPU

**HPA scales pods. It does not add nodes.** You also need the **Cluster Autoscaler** or
**Karpenter**, or pods simply sit `Pending` when the cluster is full. Both are required for
autoscaling to actually work.

**Watch for:** HPA pinned at `maxReplicas` (out of room) · flapping between values (thresholds too
tight) · scaling a workload whose bottleneck is downstream — more pods against a maxed database
makes things worse.

---

## PodDisruptionBudget (PDB)

**What it is:** protects availability during **voluntary** disruptions — node drains, cluster
upgrades, node pool replacement.

```yaml
minAvailable: 1        # or maxUnavailable: 1
selector: <matches your pods>
```

**Without a PDB, a node drain can terminate every replica at once**, because nothing tells
Kubernetes to keep any running. This surfaces during a cluster upgrade — exactly when you least
want an outage.

**Notes:** does not protect against involuntary disruption (node crash, OOM) · a PDB that can never
be satisfied (`minAvailable: 1` with `replicas: 1`) **blocks node drains indefinitely** — a common
way to get stuck mid-upgrade.

---

## Spreading and Graceful Shutdown

**Spreading** — `topologySpreadConstraints` or pod anti-affinity, so replicas do not all land on one
node or in one AZ. Without it, two replicas can share a node and a single node failure takes both.

**Graceful shutdown** — the sequence on pod termination:
1. Pod is removed from Service endpoints
2. `preStop` hook runs (if defined)
3. `SIGTERM` sent to the container
4. After `terminationGracePeriodSeconds` (default 30), `SIGKILL`

**Two things to get right:**
- The application must **handle `SIGTERM`** and finish in-flight requests. Exec-form `CMD` in the
  Dockerfile matters here — shell form swallows signals
- A short `preStop` sleep (a few seconds) covers the race between endpoint removal propagating and
  the process exiting. Without it, some in-flight requests are dropped on every deploy

---

## Deployment Strategies

| Strategy | Behavior | Notes |
|---|---|---|
| **RollingUpdate** (default) | Replace gradually per `maxSurge` / `maxUnavailable` | Zero-downtime **only if readiness probes are correct** |
| **Recreate** | Stop all, then start new | Causes downtime. Necessary when old and new cannot coexist — incompatible schema, RWO volume handoff |

Blue/green and canary are **not built in** — they need Argo Rollouts, a service mesh, or two
Deployments with Ingress weighting. Name that cost rather than implying it is free.

**`kubectl rollout undo` only works within `revisionHistoryLimit`.** And rollback **does not undo
database migrations** — say so whenever a migration is in scope.
