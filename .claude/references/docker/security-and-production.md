# Docker — Security and Production Practices

---

## Secrets — The Rules

> **`ENV` and `ARG` are visible in `docker history`. A file copied in one layer and deleted in a
> later one is still in the image.**

**If a secret has been baked into an image, it is compromised.** Rotate the credential — deleting
the file or rebuilding the image does not undo it, because the old image may already be pulled,
cached, or in a registry.

| Do | Don't |
|---|---|
| Read secrets at runtime from Secrets Manager / SSM by ARN | Put them in `ENV` or `ARG` |
| Inject via orchestrator config (task definition, ConfigMap/Secret) | `COPY .env` into the image |
| Use BuildKit `--mount=type=secret` when a build genuinely needs one | Pass them as `--build-arg` |
| Keep `.dockerignore` covering `.env*` | Rely on deleting the file in a later layer |

**Build-time secret, done correctly:**
```dockerfile
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci
```
Mounted for that layer only; never written into the image.

**Verify before pushing:**
```bash
docker history --no-trunc <image> | grep -i -E 'password|secret|token|key'
```

---

## Non-Root Containers

```dockerfile
RUN groupadd -r app && useradd -r -g app app
COPY --chown=app:app . .
USER app
```

**Why it matters:** a container escape from root is dramatically worse than from an unprivileged
user, and several platforms reject root containers outright.

**Consequences to handle:** files the app writes need ownership set · ports below 1024 require root,
so listen on 3000/8000/8080 · verify with `docker exec <container> whoami`.

---

## Runtime Hardening

| Setting | Effect |
|---|---|
| `--read-only` + tmpfs for writable paths | Attackers cannot write tools into the container |
| `--cap-drop=ALL --cap-add=<only what is needed>` | Removes Linux capabilities the app never uses |
| `--security-opt=no-new-privileges` | Blocks setuid privilege escalation |
| `--memory` / `--cpus` | Prevents one container starving the host |
| `--init` | Reaps zombies, forwards signals |

**Never, without a named justification:**
- `--privileged` — effectively root on the host
- `--network=host` — no network isolation
- **Mounting the Docker socket (`/var/run/docker.sock`) into a container — this is root on the
  host. CRITICAL.** A container with the socket can start a privileged container mounting the host
  filesystem

In production these are expressed through the orchestrator (ECS task definition, Kubernetes
SecurityContext), but the settings are the same.

---

## Image Scanning

**Scan in CI before pushing**, so a vulnerable image never reaches the registry. ECR scan-on-push
is a second net, not the primary control.

Tools: Trivy · Grype · ECR basic/enhanced scanning · Snyk.

**Decide block-vs-report explicitly.** Blocking on every transitive CVE stops all work; blocking on
critical severity in production paths is reasonable. State the policy rather than defaulting.

**Reduce findings at the source:** minimal base images (every package is attack surface) · pinned
versions · multi-stage builds so build tooling never ships · **rebuild and redeploy periodically**,
because a base image accumulates CVEs with no code change.

Exceptions to individual findings (unreachable code path, no fix available) are documented per CVE
— never by disabling the scan.

---

## Supply Chain

- Pin base images by tag, and by **digest** where integrity matters
- Pull from trusted registries; be aware Docker Hub rate-limits anonymous pulls
- Avoid `curl | sh` in a build — unpinned, unverifiable
- Commit lockfiles so builds are reproducible and scans mean something
- Consider generating an **SBOM** (`docker buildx --sbom`, or Syft) for anything distributed

---

## Production Checklist

Before an image is trusted in production:

| Item | Verify how |
|---|---|
| Pinned base image, not `:latest` | Read the `FROM` line |
| Multi-stage build; no build tools in runtime | `docker history` layer sizes |
| **Runs as non-root** | `docker exec <c> whoami` |
| **No secrets in any layer** | `docker history --no-trunc` |
| `.dockerignore` excludes `.git`, `node_modules`, `.env*` | Read it; check context size in build output |
| Healthcheck defined and passing | `docker ps` health column |
| **Exec-form `CMD`; graceful `SIGTERM`** | `docker stop` finishes fast, not after 10s |
| Port configurable and bound to `0.0.0.0` | `docker exec <c> netstat -tlnp` |
| Immutable tag (git SHA) | The deployment plan records it |
| Built for the target architecture | `docker image inspect` → `Architecture` |
| Image scanned, policy passed | CI output |
| Same artifact validated in staging | Compare digests |
| Resource limits set (via orchestrator) | Task definition / manifest |
| Logs to stdout/stderr, not a file inside the container | `docker logs` shows output |

---

## Production Principles

**One process per container.** If you need two, you probably need two containers — or a sidecar.

**Containers are disposable.** Any state that must survive lives on a volume or in an external
service. Assume the container can be killed at any moment.

**Log to stdout/stderr.** The platform collects it. Writing to a file inside the container means the
logs vanish with it — and it is a common cause of "there's nothing in the logs".

**The same image runs everywhere.** Only configuration differs. If an image only runs in one
environment, the application/infrastructure boundary is broken.

**Build once, promote the same artifact.** Rebuilding per environment means production runs
something nobody tested.

**Graceful shutdown is part of zero-downtime deploys.** The app must handle `SIGTERM`, stop
accepting new work, and finish in-flight requests within the grace period.

---

## Severity Reference for Docker Findings

| Finding | Severity |
|---|---|
| Live credentials in an image layer | **CRITICAL** — rotate immediately |
| Docker socket mounted into a container | **CRITICAL** |
| `--privileged` on an application workload | **HIGH** |
| Secrets in `ENV` / `ARG` | **HIGH** |
| Unpinned or EOL base image | HIGH |
| Running as root | MEDIUM–HIGH |
| No image scanning anywhere | MEDIUM |
| `:latest` in production | MEDIUM (correctness and rollback, not just security) |
| Missing `.dockerignore` | MEDIUM |
| No healthcheck | MEDIUM |
| No `readOnlyRootFilesystem` equivalent | LOW |
