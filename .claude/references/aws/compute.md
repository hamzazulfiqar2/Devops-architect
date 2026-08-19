# AWS Compute — EC2, ECS, EKS, Lambda, Auto Scaling

**The compute decision shapes everything else in the architecture.** Compare all four, every time,
even when the answer looks obvious.

---

## The Four-Way Comparison

| | **Lambda** | **ECS Fargate** | **EC2** | **EKS** |
|---|---|---|---|---|
| **Fits** | Event-driven, spiky, short tasks | Long-running containers | Full OS control, licensing, GPU | Many services, k8s tooling, portability |
| **Cost floor** | $0 idle | $0 idle (per-task billing) | Per-instance, always on | ~$73/mo control plane + nodes |
| **Scaling** | Automatic, per request | Service autoscaling | Manual or ASG | HPA + Cluster Autoscaler |
| **Ops overhead** | Lowest | Low | Highest — patching, AMIs, capacity | Highest in concepts and upgrades |
| **Complexity** | Low, until it isn't | Low–Medium | Medium | High |
| **Hard limits** | 15 min, 10 GB memory, 10 GB /tmp | Task startup latency | You own everything | Version upgrade treadmill |

**Decision rules against actual evidence:**

| Evidence | Implication |
|---|---|
| WebSockets, SSE, or requests > 15 min | **Lambda is out** |
| Steady round-the-clock load | Containers or EC2 usually beat per-invocation billing |
| Spiky, low-volume, event-driven | Lambda usually wins on cost *and* ops |
| A Dockerfile already exists | ECS Fargate is the low-friction path |
| GPU, custom kernel, specific licensing, long warm state | EC2 |
| Many services, existing k8s expertise, hard portability requirement | EKS |
| **Solo operator, one or two services** | **Not EKS.** Say it directly |

Always state the recommendation, the runner-up, and the condition that would flip it.

---

## EC2

**What it is:** virtual machines. Full control of the OS.

**Use when:** you need OS-level control, specific licensing, GPU, very long-running stateful
processes, or software that cannot be containerized.

**Do not use when:** a container platform would do — you are taking on patching, AMI management,
capacity planning, and scaling for no gain.

**Architecture**
- AMI from a **data source**, never a hardcoded ID — AMI IDs are region-specific and rotate
- Instance families: `t` burstable (watch CPU credits), `m` balanced, `c` compute, `r` memory,
  `g`/`p` GPU. Graviton (`t4g`, `m7g`, `c7g`) is typically ~20% cheaper and faster for compatible
  workloads — one of the best effort-to-saving ratios available
- User data changes replace instances
- Put instances in an Auto Scaling group even at size 1 — you get replacement on failure for free

**Security:** instance profile not access keys · IMDSv2 required (IMDSv1 enables SSRF credential
theft) · encrypted EBS · **SSM Session Manager instead of opening SSH** · patch via SSM Patch
Manager.

**Cost:** on-demand for unpredictable · Savings Plans / Reserved Instances for steady baseline
(only commit to what you will actually run) · **Spot** for interruptible work — batch, CI runners,
stateless workers with capacity elsewhere; never for a single stateful instance. Right-size from
two weeks of CloudWatch data; Compute Optimizer does this free.

**Common mistakes:** hardcoded AMI IDs · previous-generation instance types (newer are usually
cheaper *and* faster) · dev instances running nights and weekends · SSH open to `0.0.0.0/0` ·
treating an instance as a pet.

---

## ECS

**What it is:** AWS's container orchestrator. Two launch types: **Fargate** (serverless, no
instances) and **EC2** (you manage the instances).

**Use when:** you have containers and want them run without operating Kubernetes. **The default
container choice for most projects.**

**Do not use when:** you need the Kubernetes ecosystem specifically, or genuine multi-cloud
portability.

**Key objects**
- **Task definition** — the blueprint: image, CPU/memory, ports, environment, roles, logging.
  Immutable; each change creates a revision
- **Service** — keeps N tasks running, integrates with a load balancer, handles rolling deploys
- **Cluster** — a logical grouping. Free on Fargate

**Two roles, and people confuse them:**
- **Task execution role** — used by the ECS agent to pull images and write logs. A missing
  CloudWatch Logs permission here makes tasks fail *silently with no logs*
- **Task role** — used by **your application code** for AWS API calls

**Architecture**
- Fargate CPU/memory combinations are discrete — an over-specified task wastes a whole tier
- Tasks in private subnets need a NAT route **or** VPC endpoints (ECR api + dkr + S3 gateway) to
  pull images
- Deploys must **wait for service stability** — without it, a pipeline reports success while tasks
  crash-loop
- Use `ignore_changes` on the task definition revision if CI updates images

**Cost:** Fargate is per-vCPU-second and per-GB-second — excellent for variable load, more
expensive than well-packed EC2 at high steady utilization. **Fargate Spot** for non-critical tasks.
Scale to zero in non-production.

**Common mistakes:** confusing the two roles · no stability wait in the pipeline · oversized tasks
· `:latest` in the task definition · forgetting ECR endpoints in a private subnet.

---

## EKS

**What it is:** managed Kubernetes. AWS runs the control plane; you run the workloads and (unless
using Fargate) the nodes.

**Use when:** many services with independent lifecycles · a team that knows Kubernetes · real
multi-tenancy · genuine portability requirements · complex scheduling (DaemonSets, GPU pools,
affinity).

**Do not use when:** one or two services run by one person. The control plane alone is ~$73/month
before a node, and **the concept load is the larger bill**.

**Architecture**
- Node options: managed node groups · **Karpenter** (better bin-packing and faster scale) ·
  Fargate profiles (no nodes, per-pod billing)
- IRSA or Pod Identity for pod-level AWS permissions
- AWS Load Balancer Controller for ALB-backed Ingress
- Version upgrades are a recurring obligation — roughly annual, and you must track deprecated APIs

**Cost:** ~$73/mo per cluster + nodes. **The single biggest saving is usually fixing inflated
resource requests** — they determine bin-packing, so inflated requests mean paying for nodes to
hold air. Multiple clusters multiply the control-plane fee; weigh against namespace separation.

**Common mistakes:** choosing EKS for résumé reasons · one cluster per environment where namespaces
would do · no Cluster Autoscaler/Karpenter so nodes never scale down · nodes at 20% utilization
because requests are set far above real usage.

---

## Lambda

**What it is:** run a function; AWS handles everything else. Billed per request and per
GB-millisecond of execution.

**Use when:** event-driven work · spiky or low-volume traffic · glue between AWS services ·
scheduled tasks · anything where paying $0 at idle matters.

**Do not use when:** requests exceed 15 minutes · long-lived connections (WebSockets) · sustained
high concurrency where per-invocation billing loses to per-task · you need specific OS control.

**Architecture**
- Limits: 15 min timeout · 10 GB memory · 10 GB ephemeral `/tmp` · 250 MB unzipped deployment
  (10 GB for container images)
- **Memory and CPU are linked** — more memory means more CPU, so **raising memory sometimes lowers
  cost** by finishing faster. Test rather than assume
- **Cold starts** — worse in VPC (though much improved), worse for large packages and JVM/.NET
- **VPC attachment** is only needed to reach private resources. It adds cold-start cost and
  requires subnet IPs
- **Connection exhaustion is the classic Lambda + RDS failure** — each concurrent execution opens
  its own connection. Use **RDS Proxy**, or prefer DynamoDB
- Versions and aliases give you canary deploys almost free via weighted routing

**Cost:** $0 idle. Watch for: provisioned concurrency left on after a test · excessive timeouts ·
functions idling on network calls (you pay for the wait) · **recursive invocation** — a function
triggering itself can spend thousands in hours.

**Common mistakes:** using Lambda for a steady always-on workload · no RDS Proxy · deploying to
`$LATEST` instead of a version/alias · packaging the whole repo · no DLQ on async invocations.

---

## Auto Scaling

**What it is:** adds and removes capacity automatically. Different mechanisms per platform:
ASG (EC2) · Application Auto Scaling (ECS, DynamoDB, Aurora) · HPA + Cluster Autoscaler/Karpenter
(EKS) · built-in (Lambda).

**Architecture**
- Scale on the metric that reflects real load — CPU is a proxy, request count or queue depth is
  often better
- **Verify it scales *down*, not just up.** Look for: minimum capacity set too high, cooldowns so
  long the fleet never shrinks, scaling on the wrong metric
- Scheduled scaling for predictable patterns is simple and effective
- Scaling takes time: instance launch minutes, container seconds, Lambda milliseconds. Scale on
  leading indicators
- Autoscaling does not fix a bottleneck downstream — more app instances against a maxed database
  makes things worse

**Common mistakes:** scaling up but never down (the most common and most expensive) · minimum
capacity higher than needed · autoscaling a stateful component · no maximum, so a traffic spike or
a bug becomes an unbounded bill.
