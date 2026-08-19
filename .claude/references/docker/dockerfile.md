# Docker — Dockerfile

---

## Base Image Selection

Choose along three axes: **size**, **security surface**, and **compatibility**.

| Base | Size | Use when |
|---|---|---|
| `scratch` | Empty | Fully static binaries only (Go, Rust) |
| `distroless` | Smallest usable | Compiled binaries or runtimes needing no shell. **Hardest to debug** — no shell to exec into |
| `alpine` | Very small | Size matters and musl libc is compatible |
| `-slim` (Debian) | Small | **The safe default** for Node, Python, Ruby |
| Full (`node:22`, `python:3.13`) | Large | Build stages, or when you genuinely need the toolchain |

**Rules**
- **Pin the version**: `node:22.11-slim`, never `node:latest`, and never a bare major tag for
  production reproducibility. Pin by **digest** when supply-chain integrity matters
- Prefer official or verified-publisher images
- Match the runtime version to what the project declares (`.nvmrc`, `engines`, `runtime.txt`,
  `go.mod`)
- **Alpine's musl libc is the usual cause of "works on my machine, segfaults in the container".**
  If native modules are involved, reach for `-slim` first
- Rebuild periodically — a base image accumulates CVEs even with no code change

---

## Instructions That Matter

| Instruction | Notes |
|---|---|
| `FROM` | Pinned. Multiple `FROM`s create build stages |
| `WORKDIR` | Use it — never `RUN cd`. Creates the directory if absent |
| `COPY` | Prefer over `ADD`. `ADD` also unpacks archives and fetches URLs — surprising behavior |
| `COPY --chown` | Set ownership at copy time so a non-root user can write |
| `RUN` | Each one is a layer. Combine related commands; clean up in the same layer |
| `ENV` | **Baked into the image and visible in `docker history`. Non-sensitive defaults only** |
| `ARG` | Build-time only. **Also visible in history — never a secret** |
| `EXPOSE` | **Documentation only.** Publishes nothing |
| `USER` | Switch to a non-root user before `CMD` |
| `HEALTHCHECK` | Tells the runtime whether the container can serve |
| `ENTRYPOINT` / `CMD` | **Use exec form** (JSON array), not shell form |

---

## Multi-Stage Builds

**The single biggest lever on image size and attack surface.** Build in a fat stage; copy only the
artifact into a lean stage. Compilers, dev dependencies, build tools, and source never reach
production.

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
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
```

**Notes:** name stages (`AS build`) and copy with `--from=build` · a stage can also be a target for
tests (`--target test`) · unnamed intermediate stages are discarded automatically.

---

## Environment Variables and Configuration

**Configuration comes in at runtime, not build time.**

| Mechanism | Visible in `docker history`? | Use for |
|---|---|---|
| `ENV` in Dockerfile | **Yes** | Non-sensitive defaults: `NODE_ENV`, `PORT`, `PYTHONUNBUFFERED=1` |
| `ARG` in Dockerfile | **Yes** | Build-time values — versions, build IDs. **Never secrets** |
| `docker run -e` / env file | No | Environment-specific values in development |
| Orchestrator config (task definition, ConfigMap) | No | Environment-specific values in production |
| Secrets Manager / SSM read at runtime | No | **All secrets** |
| BuildKit `--mount=type=secret` | No | A secret genuinely needed *during* the build |

**The test:** the same image must run in dev, staging, and production with only environment
differences. If an image only runs in one environment, the config strategy is wrong.

**Build-time secrets** (a private package registry token, for example):
```dockerfile
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci
```
The secret is mounted for that layer only and never persists in the image.

---

## Non-Root Containers

```dockerfile
RUN groupadd -r app && useradd -r -g app app
COPY --chown=app:app . .
USER app
```

Many official images ship a suitable user already — `node` in Node images, for example.

**Consequences to handle:**
- Files the app writes need ownership set (`COPY --chown`, or `chown` before switching user)
- **Ports below 1024 require root.** Listen on 3000/8000/8080 rather than 80
- Some platforms reject root containers outright — this is a portability issue as well as a
  security one

Verify: `docker exec <container> whoami`.

---

## Signals and Process Management

The `CMD` process runs as **PID 1** and must handle `SIGTERM` for graceful shutdown.

```dockerfile
CMD ["node", "dist/server.js"]        # exec form — the process IS PID 1
CMD node dist/server.js               # shell form — wrapped in /bin/sh, which SWALLOWS SIGTERM
```

**Shell form turns every graceful stop into a 10-second wait followed by `SIGKILL`** — dropping
in-flight requests on every single deploy.

If the application spawns child processes or does not reap zombies, add an init: `docker run --init`,
or `tini` as the entrypoint.

---

## Health Checks

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD <command that exits 0 when healthy>
```

- `--start-period` covers slow startup without counting failures
- The probe should exercise a real path proving the app can **serve**, not just that the process
  exists
- It should **not** aggressively check downstream dependencies — a brief database blip should not
  restart every container
- **ECS and Kubernetes have their own probe mechanisms that generally supersede `HEALTHCHECK`** —
  but the application still needs the endpoint

---

## Reproducibility

- Use lockfile-respecting installs: `npm ci`, not `npm install`; `pip install -r` with pinned
  versions; `go mod download`
- Copy the lockfile before installing so the cache keys on it
- Pin base images
- Avoid `curl | sh` in a build — unpinned, unverifiable, and a supply-chain risk

---

## Dockerfile Review Checklist

| Check | Severity if wrong |
|---|---|
| Secrets in `ENV`, `ARG`, or a copied `.env` | **CRITICAL** — rotate the credential |
| `:latest` or unpinned base image | HIGH |
| No `USER` — runs as root | MEDIUM–HIGH |
| No multi-stage build; dev dependencies in the runtime image | MEDIUM |
| `COPY . .` before dependency install (cache order) | MEDIUM (cost, not security) |
| Shell-form `CMD` — signals swallowed | MEDIUM |
| Missing or thin `.dockerignore` | MEDIUM |
| Cleanup split from the `RUN` that created the mess | LOW |
| No `HEALTHCHECK` and no platform probe | MEDIUM |
| Hardcoded environment-specific URLs | MEDIUM |
| Binds `127.0.0.1` instead of `0.0.0.0` | Breaks connectivity |
