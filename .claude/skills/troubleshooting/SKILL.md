---
name: troubleshooting
description: Systematic diagnosis of DevOps, AWS, Docker, Kubernetes, CI/CD, networking, and application infrastructure problems. Follows a strict methodology — symptom, collect evidence, form hypotheses, test hypotheses, identify root cause, fix, validate, prevent recurrence — and never guesses at fixes before evidence supports one. Covers container crashes and build failures, CrashLoopBackOff, ImagePullBackOff, Pending pods, probe failures, service and ingress connectivity, cluster DNS, resource exhaustion, EC2 connectivity, ECS task failures, ALB 4xx/5xx, RDS connectivity, IAM AccessDenied, S3 access, Route 53, pipeline and registry failures, and network-layer problems from DNS through TCP, HTTP, and TLS. Provides diagnostic commands with expected output and how to interpret it. Use when something is broken, failing, erroring, hanging, unreachable, or behaving unexpectedly, or when the user asks why something doesn't work. Never runs destructive commands automatically.
---

# Troubleshooting

Evidence first. Hypotheses second. Fixes last.

## The Rule That Defines This Skill

**Never recommend a fix before the evidence supports it.** The instinct under pressure is to
suggest the three things that usually work. Resist it. A guessed fix that happens to work teaches
nothing and often masks the real cause, which returns later and worse. A guessed fix that doesn't
work costs time and adds a variable.

If you don't have enough evidence, **say what you need and how to get it**. "I can't tell yet —
run this and show me the output" is a better answer than a plausible guess.

Two corollaries:

- **Change one thing at a time.** Simultaneous changes destroy your ability to attribute the fix.
- **Never say "try restarting it" as a diagnosis.** Restarting may be the right *mitigation* while
  you investigate — say that explicitly, and note it destroys evidence, so capture logs first.

## Boundaries

- **Do not execute destructive commands automatically.** Never without explicit, specific
  approval: `kubectl delete`, `docker system prune`, `rm`, `terraform apply` or `destroy`,
  security group or IAM changes, database writes, restarts of production workloads, scaling
  changes, `force-unlock`, or `kubectl drain`. Propose the command, explain what it does and what
  it costs, wait.
- **Read-only diagnosis is always fine** — logs, describes, gets, inspects, `curl`, `dig`, `plan`.
- **Confirm the target before any command** — which cluster, which account, which environment.
- **Do not expose secrets.** If a diagnostic would print one, say so and redact.
- **In an active incident, mitigate first if users are affected** — say clearly that you're
  proposing mitigation, not a fix, and that root-cause work continues after.

## The Methodology

Announce which phase you're in. Do not skip forward to FIX.

### 1. SYMPTOM — state what is actually observed
Separate the report from the observation. "The site is down" might mean 500 errors, a timeout,
a DNS failure, or one user's cached page. Pin it down:

- **What exactly happens?** Exact error text, status code, and where it appears.
- **Who and where?** All users or one? All regions? All endpoints or one?
- **When did it start?** The single most valuable question.
- **What changed?** Deploy, config, secret rotation, DNS change, traffic spike, dependency
  incident, certificate expiry, or a scheduled job. **Most production problems are something that
  changed** — establish the change timeline before theorizing.
- **Is it constant or intermittent?** Intermittent usually means one bad instance, a race, or a
  resource limit being hit periodically.
- **Did it ever work?** Never-worked is a configuration problem. Stopped-working is a change
  problem. These have almost disjoint cause sets.

### 2. COLLECT EVIDENCE — look before you think
Gather before hypothesizing, or you'll only collect evidence that confirms your first idea.

Standard sweep: logs from the failing component (and the one in front of it) · recent events ·
the component's current state and configuration · metrics around the start time · recent changes
(deploys, commits, infrastructure applies) · the state of every dependency.

Note what you **cannot** see, and say so. Missing evidence is itself information.

### 3. FORM HYPOTHESES — several, ranked
Write down **at least two or three** candidate causes, ranked by likelihood given the evidence.
A single hypothesis is a guess wearing a hat.

Rank on: what changed recently, what the error text actually says, which layer the evidence
implicates, and base rates (DNS, config, and permissions cause more outages than exotic bugs).

For each, state **what you'd expect to see if it were true** — that's what makes it testable.

### 4. TEST HYPOTHESES — cheapest and most discriminating first
Pick tests that **eliminate** possibilities, not ones that merely confirm your favourite. A test
that can only confirm is nearly worthless; a test that could rule out three candidates is gold.

Prefer read-only tests. Prefer fast ones. **Bisect the path** — for a request crossing DNS →
load balancer → service → pod → database, test at the midpoint to halve the search space rather
than walking it end to end.

Record each result. A ruled-out hypothesis is progress, and writing it down stops you re-testing
it at hour three.

### 5. IDENTIFY ROOT CAUSE — the thing that explains everything
The root cause must explain **all** observations, including the timing and any oddities. If
something doesn't fit, you're not done — you may have found *a* cause, not *the* cause.

Ask "why" past the first answer: the pod OOMed → because the limit was 256Mi → because it was
copied from another service → because there's no sizing guidance. The last answer is what
prevention acts on.

Distinguish the **trigger** (deploy at 14:31) from the **underlying cause** (no memory headroom
since launch). Both matter; they get different fixes.

### 6. FIX — the safest change that resolves it
Present:
- **What to change**, exactly.
- **Why this fixes the root cause** — tie it to the evidence.
- **Risk and blast radius**, including whether it causes downtime.
- **How to undo it.**
- **Whether it's a fix or a mitigation.** Be honest about the difference.

**Get approval before anything that changes state.** Prefer the reversible fix, the narrowly
scoped fix, and the one you can verify.

### 7. VALIDATE — prove it
Confirm the original symptom is gone, by the same method that showed it. Then check you haven't
broken something adjacent, watch for recurrence over a sensible window, and confirm the metrics
and logs agree with "fixed". **State plainly if you couldn't fully verify.**

### 8. PREVENT RECURRENCE — the part everyone skips
- What would have **caught this earlier**? An alert, a health check, a test, a CI gate.
- What would have **prevented it**? A resource limit, a validation, a policy, a default.
- What made it **hard to diagnose**? Missing logs, no correlation IDs, an unhelpful error message.
- Should this be **documented** — a runbook entry, or a note in the repo?

Route the prevention work to the owning skill: `monitoring` for detection, `cicd` for gates,
`security` for exposure, `terraform` for configuration drift.

## Diagnostic Commands and How to Read Them

Commands are only useful with interpretation. Always say what the output *means*.

### Docker
| Command | Reveals |
|---|---|
| `docker ps -a` | Status and exit code. **137** = OOM-killed or SIGKILL · **139** = segfault · **1** = application error · **125/126/127** = daemon, permission, or command-not-found |
| `docker logs --tail 200 <id>` | Application output. Add `--previous` semantics via the exited container's id |
| `docker inspect <id>` | Full config: mounts, env, network, `State.OOMKilled`, restart count |
| `docker history <image>` | Per-layer size and the instruction that created it — finds bloat and leaked build args |
| `docker exec -it <id> sh` | Inside a running container. If this fails, the container isn't running |
| `docker build --progress=plain --no-cache` | Full build output with no cache hiding the failing step |

### Kubernetes
| Command | Reveals |
|---|---|
| `kubectl config current-context` | **Run this first, every time.** Which cluster you're about to touch |
| `kubectl get pods -o wide` | Status, restarts, node placement, age |
| `kubectl describe pod <p>` | **The Events section at the bottom is usually the answer.** Scheduling failures, pull errors, probe failures, OOM kills |
| `kubectl logs <p> --previous` | Logs from the crashed container — essential for CrashLoopBackOff |
| `kubectl get events --sort-by=.lastTimestamp` | Cluster-wide recent events (expire after ~1h) |
| `kubectl get endpoints <svc>` | **Empty means the selector matches no ready pod** — the answer to most "service returns nothing" |
| `kubectl top pods` / `top nodes` | Actual usage vs limits |
| `kubectl exec -it <p> -- sh` | Test connectivity from inside the network, rather than reasoning about it |

### AWS
| Command | Reveals |
|---|---|
| `aws sts get-caller-identity` | **Which identity you actually are.** First command for any AccessDenied |
| `aws ecs describe-tasks --tasks <id>` | `stoppedReason` and container `reason` — why a task died |
| `aws ecs describe-services --services <s>` | Deployment state, events, running vs desired |
| `aws elbv2 describe-target-health --target-group-arn <a>` | Which targets are unhealthy and the reason string |
| `aws logs tail <group> --follow` | Live CloudWatch logs |
| `aws rds describe-db-instances` | Status, endpoint, `PubliclyAccessible`, subnet group |
| `aws ec2 describe-security-groups --group-ids <id>` | Actual rules, not what you think they are |

### Networking — test layer by layer
| Command | Reveals |
|---|---|
| `dig <host>` / `nslookup` | Does the name resolve, and to what? Compare against expectation |
| `nc -zv <host> <port>` | Is the TCP port reachable? Separates network from application |
| `curl -v https://host/path` | Full request/response including TLS handshake and headers |
| `curl -w "%{time_total}"` | Where time is spent — DNS, connect, TLS, first byte |
| `openssl s_client -connect host:443 -servername host` | Certificate chain, expiry, SNI, TLS version |
| `traceroute` / `mtr` | Routing path, when the problem is genuinely network-layer |

**Layer discipline:** resolve → connect → TLS → HTTP → application. Test in that order and stop
at the first failure. DNS resolving but TCP refusing is a completely different problem from DNS
not resolving, and jumping to the application layer wastes both.

## Symptom Playbooks

Each entry: what it means, then likely causes **in order of base rate**, then the discriminating
check. Work the list; don't jump.

### Docker

**Container exits immediately** — Check exit code and logs first. Causes: application error on
startup · missing required env var · wrong `CMD` · process daemonizes instead of staying
foreground · architecture mismatch (`exec format error` — an arm64 image on amd64) · OOM (137).

**Image build fails** — Read the failing step, not the last line. Causes: dependency install
needing build tools absent from a slim base · musl vs glibc on Alpine · network egress blocked ·
private registry auth · file not in build context (excluded by `.dockerignore`) · disk full on
the builder.

**Can't connect to a container** — Causes: port not published · app bound to `127.0.0.1` instead
of `0.0.0.0` (extremely common) · wrong host:container port order · app not actually listening ·
firewall on the host.

**Containers can't reach each other** — Causes: not on the same network · using `localhost`
instead of the service name (in Compose, `localhost` is *that* container) · dependency not ready
yet (`depends_on` doesn't wait for readiness) · wrong port.

**Volume/data problems** — Causes: data written to the container's writable layer, not a volume ·
bind mount path wrong or masking the image's content · permission denied after adding `USER`
(files owned by root — fix with `--chown`) · named volume holding stale data from an earlier run.

### Kubernetes

**CrashLoopBackOff** — the container starts and dies repeatedly. `logs --previous` is the first
move, always. Causes: application error on boot · missing env var, ConfigMap, or Secret · failing
liveness probe (check whether it needs a startup probe instead) · OOMKilled (`describe` shows it,
exit 137) · wrong command · dependency unreachable at startup.

**ImagePullBackOff / ErrImagePull** — `describe` gives the exact registry error. Causes: tag
doesn't exist or was overwritten · wrong repository path · missing `imagePullSecrets` for a
private registry · node has no route to the registry (private subnet with no NAT or ECR VPC
endpoint) · expired ECR token · architecture mismatch · rate limiting on Docker Hub.

**Pending** — the pod isn't scheduled; `describe` states why. Causes: insufficient CPU/memory on
any node · no node matches nodeSelector/affinity · a taint with no matching toleration ·
unbound PVC (no StorageClass, or a `ReadWriteOnce` volume attached elsewhere) · cluster
autoscaler at max or unable to add nodes.

**Running but not Ready** — the readiness probe fails. Check path, port, and scheme; whether the
app binds `0.0.0.0`; whether `initialDelaySeconds` is too short for real startup time. Then
`exec` in and curl the endpoint yourself — that single test usually settles it.

**Service connectivity fails** — `kubectl get endpoints <svc>` first. Empty endpoints means
label/selector mismatch or no ready pods. Non-empty means look at `targetPort` vs the container's
actual port, then NetworkPolicy, then the client's DNS name form.

**Ingress not working** — Causes: no ingress controller running (the Ingress object alone does
nothing) · wrong `ingressClassName` · backend service or port wrong · TLS secret missing or in the
wrong namespace · DNS not pointing at the load balancer · controller logs will usually say.

**Cluster DNS problems** — Test from inside a pod: `nslookup <svc>.<ns>.svc.cluster.local`.
Causes: wrong name form (cross-namespace needs `<svc>.<ns>`) · CoreDNS pods unhealthy or
resource-starved · NetworkPolicy blocking egress to kube-dns (a subtle one) · `dnsPolicy` override.

**Resource exhaustion** — `top nodes`, `describe node`. Look for `MemoryPressure`, `DiskPressure`,
evictions, and OOM kills. Causes: limits too low · a genuine leak · requests set far below actual
usage so the scheduler overcommits · node disk filled by images or logs.

### AWS

**EC2 unreachable** — Layer by layer: security group inbound · NACL (stateless, needs both
directions) · route table has a path to an IGW · instance has a public IP · instance is running
and passed status checks · the OS-level service is listening. Prefer SSM Session Manager over
opening SSH.

**ECS task fails** — `describe-tasks` and read `stoppedReason` verbatim; it usually names the
cause. Common: image pull failure (ECR permissions on the **task execution role**, or no route to
ECR) · container exited (application problem — go to the container logs) · failed ELB health check
· insufficient capacity or subnet IPs · task execution role missing CloudWatch Logs permission
(which makes it fail *silently*, with no logs to read — check the role when logs are mysteriously
absent).

**ALB 5xx** — `502` = target returned something invalid or closed the connection (usually the app
crashed or the port is wrong) · `503` = no healthy targets (check target health first) ·
`504` = target timed out (app too slow, or the idle timeout is shorter than the response). Check
`describe-target-health` before anything else. **ALB 4xx**: `400` malformed · `401/403` auth or
WAF · `404` listener rule doesn't match. Distinguish `ELB_*` metrics (the load balancer generated
it) from `Target_*` (your app did) — that split tells you which side to investigate.

**RDS connectivity** — In order: security group allows the client's SG on the database port ·
database is in the expected subnet · `PubliclyAccessible` matches intent · correct endpoint and
port · credentials valid · **connection limit not exhausted** (the classic serverless failure —
check `DatabaseConnections` against the instance max) · SSL required but not used by the client.

**IAM AccessDenied** — Read the error message; it names the principal, the action, and the
resource. Then: `sts get-caller-identity` to confirm who you actually are · does a policy allow
that exact action on that exact ARN · is there an explicit Deny (which always wins) · SCP at the
organization level · permission boundary · resource policy (bucket policy, KMS key policy) —
**cross-account access needs both sides** · missing `iam:PassRole` · wrong region in the ARN.
Use the IAM Policy Simulator rather than guessing.

**S3 access problems** — Bucket policy, IAM policy, account-level public access block, object
ownership and ACLs, KMS key policy for encrypted objects (a very common miss — read access to the
object isn't enough without `kms:Decrypt`), the region, and presigned URL expiry.

**DNS / Route 53** — `dig` the record and compare against the hosted zone. Causes: registrar
nameservers don't match the zone · record not created or wrong type · TTL still serving the old
value (check whether enough time has passed) · CNAME at the apex (needs an ALIAS) · split-horizon
private zone · propagation still in flight.

### CI/CD

**Build fails in CI but works locally** — Different runtime version · missing env var · a
dependency installed globally on your machine · case-sensitive filesystem on Linux · something
uncommitted · a cache carrying stale state. Compare the runner's tool versions first.

**Tests fail intermittently** — Shared state between tests · timing and ordering assumptions ·
port collisions · a service container not ready before tests start (add a readiness wait before
blaming the tests) · timezone or locale differences.

**Deployment fails** — Read the deploy step's full log. Then: does the target exist · does the
identity have permission · is the artifact where it's expected · did a health check fail after
deploy · is the pipeline reporting success without waiting for stability (a green pipeline over a
failed deploy is its own bug).

**Authentication problems** — For OIDC: missing `id-token: write` permission · trust policy `sub`
condition doesn't match the repo/branch/environment (compare character by character) · wrong role
ARN · wrong region. For static credentials: expired, rotated, or scoped to the wrong account.

**Registry failures** — Push denied: missing `ecr:GetAuthorizationToken` (an account-level action)
or repository-scoped push permission, or the repository doesn't exist. Pull failures on the
runtime side: see ImagePullBackOff above. Token expiry mid-pipeline on long builds.

## Output Format

For each problem worked:

1. **Symptom** — precisely what is observed, with the exact error and the timeline.
2. **Likely causes** — ranked, with the reason for the ranking.
3. **Evidence needed** — what would discriminate between them.
4. **Diagnostic commands** — copy-pasteable, read-only, in the order to run them.
5. **Expected output** — what each result *means*, including what a healthy result looks like.
6. **Root cause** — the one that explains every observation, stated once confirmed.
7. **Recommended fix** — safest option, with risk, blast radius, and how to undo it.
8. **Validation** — how to confirm it's actually fixed.
9. **Prevention** — detection, prevention, and diagnosability improvements.

## Working Style

- Say what you know, what you suspect, and what you haven't checked. Keep them separate.
- Quote actual output rather than paraphrasing it — details in error strings matter.
- When the evidence runs out, ask for the specific next piece rather than speculating further.
- Teach the reasoning, not just the command. The user is learning, and the diagnostic method
  transfers to problems neither of you has seen.
- Don't be clever before you're thorough. The boring cause — a typo, a missing env var, a wrong
  port, an expired credential — is usually the real one.
- **Diagnose freely. Change nothing without approval.**
