# Docker — Images, Containers, Layers, and Build Cache

---

## Images and Containers

**Image** — an immutable, layered filesystem snapshot plus metadata (entrypoint, environment,
exposed ports, user). Identified by a **digest** (`sha256:...`); tags are movable pointers to it.

**Container** — a running instance of an image: the image's read-only layers plus a thin writable
layer on top, in isolated namespaces (PID, network, mount) with cgroup resource limits.

**The consequence that matters:** the writable layer **disappears when the container is removed**.
Anything the application writes and needs later must go to a volume or external storage. This is
the most common cause of "my data vanished after a restart".

---

## Layers

Each `RUN`, `COPY`, and `ADD` creates a layer. `ENV`, `WORKDIR`, `USER`, `LABEL`, and `EXPOSE`
change metadata only.

**Properties**
- Layers are **immutable and content-addressed**. Identical layers are shared between images and
  stored once
- Layers **stack**. A file deleted in layer 5 is still present in layer 3 — the image just hides it
- Pulling an image downloads only layers not already present locally

> **Security consequence:** copying a secret in one layer and deleting it in a later one **does not
> remove it from the image**. Anyone can extract it. If that has happened, the credential is
> compromised and must be rotated, not just deleted.

**Size consequence:** `RUN apt-get install ... && rm -rf /var/lib/apt/lists/*` in **one** `RUN`
works, because the cleanup happens in the same layer. Split across two `RUN`s, the cache is still
in the first layer and the image is no smaller.

---

## Build Cache

Docker reuses a cached layer when the instruction **and its inputs** are unchanged. Once one layer
misses, **every layer after it rebuilds**.

**Order instructions from least likely to change to most likely to change:**

```dockerfile
COPY package*.json ./       # changes rarely
RUN npm ci                  # cached until manifests change
COPY . .                    # changes on every commit
```

Reversed — `COPY . .` before the install — every code edit reinstalls every dependency. **This is
the most common and most expensive Dockerfile mistake.**

**Cache invalidation rules**
- `COPY`/`ADD` invalidate on **file content** changes (checksum), not timestamps
- `RUN` invalidates when the command string changes — so `RUN apt-get update` alone can serve stale
  package lists for months. Always combine `update` and `install` in one `RUN`
- Changing any earlier layer invalidates everything downstream
- `ARG` values used in a layer invalidate it when they change

**Cache in CI** — a fresh runner has no local cache. Use BuildKit with a shared cache backend:
```
--cache-from type=gha --cache-to type=gha,mode=max      # GitHub Actions
--cache-from type=registry,ref=<repo>:buildcache        # registry-backed
```
Without this, CI rebuilds everything on every run.

---

## Build Context

The directory passed to `docker build`. **The entire context is sent to the builder before the
build starts** — before any instruction runs.

**Consequences**
- A large context (a `.git` directory, `node_modules`, build output) makes **every** build slow,
  even a cached one
- Files in the context can be `COPY`'d — including ones you did not intend, like a local `.env`

**`.dockerignore` is both a performance and a security control.** It is the thing standing between
a local `.env` file and a published image.

Minimum contents:
```
.git
.gitignore
node_modules
__pycache__
.venv
dist
build
coverage
*.log
.env*
.terraform
*.tfstate*
.DS_Store
.idea
.vscode
README.md
```

The build output prints the context size — check it when builds feel slow.

---

## Inspecting Images

| Command | Reveals |
|---|---|
| `docker history <image>` | **Per-layer size and the instruction that created it.** Finds bloat and leaked build args |
| `docker image inspect <image>` | Full metadata: env, entrypoint, user, exposed ports, digest |
| `docker images` | Local images and sizes |
| `docker system df` | Where disk is going — images, containers, volumes, cache |

`docker history` is the tool for two questions: **why is this image so big**, and **does it contain
a secret**.

---

## Image Size — What Actually Drives It

In rough order of impact:

1. **No multi-stage build** — compilers, dev dependencies, and source shipped to production
2. **Full base image** where slim or distroless would do
3. **Package manager caches** left behind
4. **Files added then deleted in a later layer** — still in the image
5. **The build context** copied wholesale via `COPY . .` with a thin `.dockerignore`

A typical Node application goes from ~1.1 GB to ~180 MB with a multi-stage build and a slim base.
Quote real numbers when proposing the change.

**Why size matters:** faster pulls (deploy latency, autoscaling responsiveness), lower registry
storage and transfer cost, and **less attack surface** — every package is something with CVEs.

---

## Architecture (amd64 vs arm64)

An image is built for a specific CPU architecture. Building on Apple Silicon produces `arm64`;
most cloud compute runs `amd64`.

**The symptom:** `exec format error` — the container starts and immediately dies.

**Fixes:** `docker build --platform linux/amd64` · `docker buildx build --platform
linux/amd64,linux/arm64` for a multi-arch image · or run on Graviton (`arm64`) instances
deliberately, which is often cheaper.

Always state the target architecture in a build pipeline rather than relying on the runner's
default.
