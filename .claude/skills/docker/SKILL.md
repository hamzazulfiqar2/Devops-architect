---
name: docker
description: Design, build, optimize, troubleshoot, and review Docker containerization for software projects. Covers Dockerfile design, base image selection, layers and build cache, build context and .dockerignore, multi-stage builds, image optimization and security, non-root containers, tagging and versioning, networking and ports, environment variables, volumes and bind mounts, health checks, Docker Compose, registries including AWS ECR, and container troubleshooting. Audits existing Dockerfiles for oversized images, wasted layers, secrets baked into images, bad base images, poor cache ordering, missing health checks, and wrong runtime configuration. Use when the user mentions Docker, Dockerfile, containers, images, docker-compose, container builds, "why is my image so big", "container won't start", or containerizing an application. Explains concepts in simple English while it works.
---

# Docker

Containerize deliberately. Understand the application first, then write the Dockerfile.

## Before You Recommend Anything

Never write or change a Dockerfile before you know what the application actually needs.
Establish these first — from the repo, from a completed `project-discovery`, or by asking:

- **Language and runtime version** — the exact version, from a version file or lockfile.
- **Build steps** — compile, transpile, bundle, asset build; what produces the artifact.
- **Runtime entry point** — the command that starts it, and whether it forks workers.
- **Ports** — what it listens on, and whether the port is hardcoded or configurable.
- **Configuration** — every environment variable, and which are required to boot.
- **Secrets** — which config values are sensitive.
- **State** — anything written to disk, and whether it must survive a restart.
- **Dependencies at boot** — a database, cache, or queue the container waits on.
- **Health endpoint** — an existing one, or the fact that there isn't one.
- **Target platform** — local dev, CI, ECS, EKS, or something else. Affects almost nothing
  in the Dockerfile itself, and that is the point: keep the image portable.
- **Architecture** — `amd64` vs `arm64`, and whether the build host differs from the run host.

If something on this list is unknown and it changes the Dockerfile, **ask**. Do not guess a
runtime version or invent a start command.

## Boundaries

- **Never deploy containers to production automatically.** Building an image locally is fine.
  Pushing to a production registry, or running against production, requires explicit approval
  each time.
- **Never modify files without approval.** Propose the Dockerfile, show the diff, explain the
  changes, then wait. This includes `.dockerignore` and compose files.
- **Never run destructive Docker commands without approval** — `docker system prune`,
  `docker volume rm`, `docker rm -f` on unknown containers, or anything removing named volumes
  holding data.
- **Stay out of AWS architecture decisions.** Choosing ECS vs EKS vs Lambda, sizing tasks,
  designing VPCs, or picking a compute platform belongs to `aws-architecture`. This skill
  covers ECR as a *registry* — repositories, tagging, lifecycle policies, scanning, login —
  and stops there.

## Teaching As You Work

The user is learning. Define each concept the first time it appears, in one plain sentence,
and use everyday comparisons. Keep it inline and short; go long only when asked.

- **Image** — a frozen snapshot of a filesystem plus the command to run. Like a recipe's
  finished cake, boxed up.
- **Container** — a running instance of an image. One cake, being eaten. Delete it and the
  image is untouched.
- **Layer** — each instruction in a Dockerfile adds a stacked, read-only filesystem slice.
  Layers are cached and shared between images.
- **Build cache** — Docker reuses a layer if that instruction and its inputs haven't changed.
  Change something early and every layer after it rebuilds.
- **Build context** — the folder you hand to `docker build`. Everything in it is sent to the
  builder before the build starts.
- **Registry** — a warehouse for images. Docker Hub, ECR, GHCR.
- **Volume** — storage that lives outside the container so data survives the container's death.

## Dockerfile Design

### Base image selection
Choose along three axes: **size**, **security surface**, and **compatibility**.

| Base | Size | Use when |
|---|---|---|
| `distroless` | Smallest | Compiled binaries, or runtimes that need no shell. Hardest to debug. |
| `alpine` | Very small | Size matters and musl libc is compatible. Watch for native-module and DNS quirks. |
| `-slim` (Debian) | Small | The safe default for most Node, Python, and Ruby apps. |
| Full (`node:22`, `python:3.13`) | Large | Build stages, or when you genuinely need the toolchain. |
| `scratch` | Empty | Fully static binaries (Go, Rust) only. |

Rules: **pin the version** (`node:22.11-slim`, never `node:latest`, never bare `node:22` for
production reproducibility — and pin by digest when supply-chain integrity matters). Prefer
official or verified publisher images. Match the runtime version to what the project declares.
Alpine's musl libc is the usual cause of "works on my machine, segfaults in the container" —
if native modules are involved, reach for `-slim` first.

### Layer and cache ordering
Order instructions from **least likely to change** to **most likely to change**. Dependency
manifests get copied and installed before application source, so a code edit doesn't reinstall
every dependency.

```dockerfile
COPY package*.json ./       # changes rarely
RUN npm ci                  # cached until manifests change
COPY . .                    # changes constantly
```

The reverse order rebuilds all dependencies on every single code change — one of the most
common and most expensive Dockerfile mistakes.

Also: combine related `RUN` commands so cleanup happens in the same layer as the thing it
cleans (deleting a file in a *later* layer does not shrink the image — the bytes are still in
the earlier layer). Use `--no-cache` or clean package manager caches inline.

### Multi-stage builds
The single biggest lever on image size and security. Build in a fat stage, copy only the
artifact into a lean stage. Compilers, dev dependencies, build tools, and source code never
reach the final image.

```dockerfile
FROM node:22.11-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22.11-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
```

Explain the gain in numbers when you propose it: a typical Node app goes from ~1.1 GB to
~180 MB this way.

### Non-root containers
Create or use an unprivileged user and switch to it before `CMD`. A container escape from
root is dramatically worse than one from an unprivileged user, and several platforms reject
root containers outright.

```dockerfile
RUN groupadd -r app && useradd -r -g app app
USER app
```

Files the app must write to need ownership set (`COPY --chown=app:app`). Ports below 1024
require root, so listen on 3000/8000/8080 rather than 80.

### Build context and .dockerignore
Everything in the build context is uploaded to the daemon before the build begins. A missing
`.dockerignore` means `node_modules`, `.git`, and build output get shipped, slowing every
build and risking secrets landing in the image.

Always include at minimum: `.git`, `node_modules`, `__pycache__`, `.venv`, `dist`, `build`,
`*.log`, `.env*`, `.DS_Store`, `coverage`, `.terraform`, `*.tfstate*`, `.idea`, `.vscode`.

`.dockerignore` is also a security control: it is the thing standing between a local `.env`
and a published image.

### Environment variables and configuration
Config comes in **at runtime**, not at build time. `ENV` in a Dockerfile is baked into the
image and visible to anyone with `docker history`.

- `ENV` — non-sensitive defaults only (`NODE_ENV`, `PORT`, `PYTHONUNBUFFERED=1`).
- `ARG` — build-time values. **Also visible in image history — never a secret.**
- Runtime `-e` / env files / orchestrator config — everything environment-specific.
- Secrets — injected at runtime by the platform, or via BuildKit `--mount=type=secret` when a
  build genuinely needs one. Never `ARG`, never `ENV`, never `COPY`.

The same image must run in dev, staging, and production with only environment differences.
If an image can only run in one environment, the config strategy is wrong.

### Ports
`EXPOSE` is documentation — it publishes nothing. Actual publishing happens at run time
(`-p 8080:3000`, host:container) or through the orchestrator. Make the port configurable
(`PORT` env var) and bind to `0.0.0.0`, not `127.0.0.1` — binding to localhost inside a
container makes it unreachable from outside, a very common "my container starts but I can't
connect" cause.

### Volumes and bind mounts
- **Named volume** — Docker-managed storage for data that must survive the container. Use for
  databases and uploads.
- **Bind mount** — a host directory mapped in. Use for local development hot-reload. Avoid in
  production; it couples the container to the host's filesystem layout.
- **tmpfs** — memory-only, for scratch data that should never touch disk.

Anything the app writes and needs later must be on a volume or in external storage. Containers
are disposable; their writable layer disappears with them.

### Health checks
A health check tells the platform whether the container is actually serving, not merely
running. Without one, a hung process looks healthy and keeps receiving traffic.

`--start-period` covers slow startup, `--interval` sets the cadence, `--retries` sets tolerance.
The probe should exercise a real path — an endpoint that verifies the app can serve — but should
not check downstream dependencies so aggressively that a brief database blip restarts every
container. Note that ECS and Kubernetes have their own probe mechanisms that generally supersede
`HEALTHCHECK`; the app still needs the endpoint.

### Signals and process management
The `CMD` process runs as PID 1 and must handle `SIGTERM` for graceful shutdown. Use exec form
(`CMD ["node", "server.js"]`) — shell form wraps the process in `/bin/sh`, which swallows
signals and turns every stop into a 10-second kill. If the app spawns children or doesn't reap
zombies, add an init (`--init`, or `tini`).

### Tagging and versioning
Never deploy `:latest` — it is mutable, unreproducible, and makes rollback guesswork. Tag with:

- An **immutable** identifier: git SHA (`app:a1b2c3d`) or semver (`app:1.4.2`).
- A **moving** convenience tag if desired (`app:staging`), pointing at an immutable one.

Build once, tag once, promote the same digest through environments. Rebuilding per environment
means you deploy something you never tested.

## Docker Compose

Compose is for **local development and testing**, not production orchestration. Use it to
stand up the app plus its dependencies (database, cache, queue) with one command.

Cover: service definitions, `depends_on` with `condition: service_healthy` (plain `depends_on`
only waits for start, not readiness), named volumes for data, `env_file` for config, port
mappings, bind mounts for hot reload, profiles for optional services, and networks — services
reach each other by **service name**, not `localhost`, which is the most common Compose
connection error.

Keep dev-only concerns (bind mounts, exposed database ports, debug env) in a compose override
file so the base file stays honest.

## Registries and AWS ECR

**Registry basics** — `docker tag` renames locally, `docker push` uploads, `docker pull`
downloads. A tag is a pointer; a digest (`sha256:...`) is the immutable identity.

**ECR specifics** (registry concerns only — platform choice belongs to `aws-architecture`):
- Authenticate with `aws ecr get-login-password | docker login --username AWS --password-stdin <acct>.dkr.ecr.<region>.amazonaws.com`. Tokens expire after 12 hours.
- One repository per image, named for the service.
- **Enable scan-on-push** — free basic vulnerability scanning.
- **Set a lifecycle policy** — untagged and old images accumulate and bill as storage forever.
  This is the ECR mistake that quietly costs money.
- **Consider tag immutability** so a tag can never be repointed under a running deployment.
- Prefer OIDC-based CI authentication over long-lived access keys.
- Note that pulls from a VPC without a NAT gateway need an ECR VPC endpoint — flag it as a
  requirement, and leave the networking design to `aws-architecture`.

## Auditing an Existing Dockerfile

When reviewing, check every item below and report findings ranked by severity, each with the
line, the impact, and the fix.

| Category | What to look for |
|---|---|
| **Secrets in image** | `ENV`/`ARG` holding credentials, `COPY .env`, keys in source copied into the image, secrets in an early layer "removed" later. **Highest severity — a deleted file in a later layer is still in the image; treat the credential as compromised and rotate it.** |
| **Bad base image** | `:latest`, unpinned, unofficial, EOL runtime, full image where slim would do, architecture mismatch. |
| **Oversized image** | No multi-stage build, dev dependencies in the final image, package manager caches left behind, source and build tools shipped to runtime, large files added then deleted in a later layer. |
| **Unnecessary layers** | Chained `RUN`s that could be one, cleanup separated from the command that created the mess, redundant `COPY`s. |
| **Poor caching** | `COPY . .` before dependency install, manifests copied with the whole tree, frequently-changing instructions placed early. |
| **Root user** | No `USER` instruction, or `USER root` at the end. |
| **Missing health check** | No `HEALTHCHECK` and no platform probe defined elsewhere. |
| **Port configuration** | Hardcoded port, binding to `127.0.0.1`, `EXPOSE` mismatching the actual listen port, privileged port requiring root. |
| **Hardcoded configuration** | Environment-specific URLs, hostnames, or feature flags baked in; anything preventing one image from running in every environment. |
| **Runtime configuration** | Shell-form `CMD` breaking signal handling, no graceful shutdown, `ENTRYPOINT`/`CMD` confusion, missing `WORKDIR`, missing `NODE_ENV=production` or equivalent, no init for zombie reaping. |
| **Build context** | Missing or thin `.dockerignore`, `.git` or `node_modules` shipped, huge context slowing builds. |
| **Reproducibility** | Unpinned dependencies, `npm install` instead of `npm ci`, no lockfile copied, network-dependent build steps. |

Report format per finding: **Severity · Line · What is wrong · Why it matters · The fix.**
Give the corrected Dockerfile at the end, whole, with changes explained — but **do not write it
to disk until approved**.

## Troubleshooting Playbook

Work the symptom to the cause, in this order.

**Container exits immediately** — `docker logs <id>` first, always. Then: is the `CMD` correct?
Does the process daemonize (containers need a foreground process)? Missing required env var?
Wrong architecture (`exec format error`)? Check `docker inspect` for the exit code — 137 is
OOM-kill, 139 is segfault, 1 is application error.

**Can't connect to the container** — Is it publishing a port (`docker ps`)? Is the app bound to
`0.0.0.0`? Does the published port map to the right container port? Is the app actually
listening (`docker exec <id> netstat -tlnp` or check its logs)?

**Containers can't reach each other** — Same network? Using service name rather than `localhost`?
In Compose, `localhost` inside a container means *that container*. Ready yet, or just started?

**Build is slow** — Check context size (build output prints it). Check `.dockerignore`. Check
cache ordering. Look for cache-busting instructions early in the file.

**Image is too big** — `docker history <image>` shows per-layer size and the instruction that
created it. Look for the biggest layers first; usually dev dependencies, caches, or a missing
multi-stage build.

**Build fails on dependency install** — Native modules needing build tools absent from a slim
base, musl vs glibc on Alpine, private registry auth, or network egress restrictions.

**Works locally, fails elsewhere** — Architecture mismatch (Apple Silicon builds `arm64`;
most cloud runs `amd64` — use `--platform` or buildx). Missing runtime env var. Bind mount
masking a path that doesn't exist elsewhere. Image built from uncommitted local files.

**Data disappears on restart** — Written to the container's writable layer instead of a volume.

**Permission denied after adding USER** — Files owned by root; fix with `COPY --chown` or
`chown` before switching user.

Useful commands: `docker logs -f`, `docker exec -it <id> sh`, `docker inspect`, `docker history`,
`docker stats`, `docker events`, `docker build --progress=plain --no-cache`.

## Output When Designing a Docker Solution

Produce these ten sections.

1. **Why Docker is needed** — the concrete problem it solves here (reproducible builds,
   dependency isolation, parity between environments, deployability). If Docker is *not*
   warranted for this project, say so instead of containerizing by reflex.
2. **What should be containerized** — one container per process. List each unit and its
   boundary; explain what stays outside (managed databases, static assets, build tooling).
3. **Recommended Dockerfile** — complete and working, with comments on non-obvious lines and a
   walkthrough of what each stage does and why.
4. **Recommended image strategy** — base image and pin, multi-stage layout, expected final size,
   tagging scheme, and the build-once-promote-everywhere rule.
5. **Environment configuration** — every variable by name, required vs optional, defaults, which
   are secrets, and how each reaches the container at runtime. `.dockerignore` contents included.
6. **Build process** — exact commands for local and CI, build args, platform flags, caching
   strategy, and what CI should do differently from a laptop.
7. **Registry strategy** — where images live, repository naming, tag scheme, retention and
   lifecycle, scanning, and authentication. ECR specifics if relevant.
8. **Runtime configuration** — how the container is started, ports, volumes, resource limits,
   restart policy, health check, and graceful shutdown behavior. Compose file for local dev.
9. **Security considerations** — non-root, minimal base, no secrets in the image, pinned
   versions, scanning in CI, read-only root filesystem where possible, dropped capabilities,
   and the residual risks that remain.
10. **Troubleshooting steps** — the three or four failure modes most likely for *this* setup,
    with the command to diagnose each.

Close with what to verify before trusting the image: it builds clean, runs locally, passes its
health check, contains no secrets (`docker history`), runs as non-root (`docker exec whoami`),
and stops gracefully on `SIGTERM`.
