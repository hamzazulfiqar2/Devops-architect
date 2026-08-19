# Docker — Runtime and Compose

---

## Ports

`EXPOSE` in a Dockerfile is **documentation only** — it publishes nothing. Actual publishing happens
at run time:

```bash
docker run -p 8080:3000 myapp        # host:container
```

**The two failures people hit**

| Mistake | Symptom |
|---|---|
| App binds `127.0.0.1` instead of `0.0.0.0` | Works inside the container, unreachable from outside. **Very common** |
| Host/container port order reversed | Connection refused |

Inside a container, `127.0.0.1` means *that container* — not the host, and not another container.

Make the port configurable via an environment variable (`PORT`) and bind to `0.0.0.0`.

---

## Volumes and Mounts

| Type | Lifetime | Use for |
|---|---|---|
| **Named volume** | Docker-managed, survives the container | Databases, uploads, anything that must persist |
| **Bind mount** | A host directory mapped in | **Local development hot-reload.** Avoid in production — couples the container to the host's filesystem layout |
| **tmpfs** | Memory only | Scratch data that should never touch disk |

```bash
docker run -v mydata:/var/lib/postgresql/data postgres:16   # named volume
docker run -v "$(pwd)":/app node:22-slim                    # bind mount (dev)
```

**Anything the application writes and needs later must be on a volume or in external storage.** A
container's writable layer disappears with the container.

**Permission gotcha:** after adding `USER app`, bind-mounted host files may be owned by a different
UID, causing permission-denied errors that did not appear when running as root.

---

## Networks

| Driver | Behavior |
|---|---|
| `bridge` (default) | Containers on the same user-defined bridge reach each other **by name** |
| `host` | Shares the host's network stack. No isolation |
| `none` | No networking |

**On a user-defined network, containers resolve each other by container/service name.** On the
default bridge, they do not — which is why Compose creates its own network.

**The most common connectivity error:** using `localhost` to reach another container. Use the
service name.

---

## Resource Limits

```bash
docker run --memory=512m --cpus=1.5 myapp
```

Without limits, one container can starve the host. In production this is handled by the
orchestrator (ECS task definition, Kubernetes requests/limits) rather than the Docker CLI — but the
same principle applies.

**Memory over limit → the container is OOM-killed (exit 137). CPU over limit → throttled, not
killed.** A CPU-throttled container looks slow while showing low CPU usage.

---

## Signals and Restart

```bash
docker run --restart=unless-stopped --init myapp
```

- `--init` adds a minimal init process to reap zombies and forward signals — useful when the app
  spawns children
- `docker stop` sends `SIGTERM`, waits 10 seconds, then `SIGKILL`. Exec-form `CMD` is required for
  the application to actually receive the signal
- Restart policies (`no`, `on-failure`, `always`, `unless-stopped`) matter for standalone Docker;
  orchestrators manage this themselves

---

## Docker Compose

**Compose is for local development and testing — not production orchestration.** Use it to stand up
the app plus its dependencies with one command.

```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    env_file: [.env]
    depends_on:
      db:
        condition: service_healthy      # waits for READY, not just started
    volumes:
      - .:/app                          # dev hot-reload only
      - /app/node_modules               # anonymous volume shields container deps

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 5

volumes:
  pgdata:
```

**The four things people get wrong**

1. **Plain `depends_on` only waits for the container to *start*, not to be *ready*.** Use
   `condition: service_healthy` with a healthcheck on the dependency. This is the single most common
   Compose bug
2. **Services reach each other by service name, not `localhost`.** The app connects to `db:5432`
3. **Bind-mounting the source over `/app` hides the container's `node_modules`.** The anonymous
   volume above shields it
4. **Named volumes hold stale data between runs.** `docker compose down -v` removes them — which is
   destructive, so never run it casually

**Other notes:** keep dev-only concerns (bind mounts, exposed database ports, debug env) in a
`docker-compose.override.yml` so the base file stays honest · `profiles` for optional services ·
secrets belong in a gitignored `.env`, never inline in the compose file.

---

## Troubleshooting

**Exit codes**

| Code | Meaning |
|---|---|
| 0 | Clean exit |
| 1 | Application error |
| **125** | Docker daemon error (bad flag) |
| **126** | Command found but not executable |
| **127** | Command not found |
| **137** | **SIGKILL — usually OOM-killed** |
| 139 | Segfault (often an architecture or libc mismatch) |
| 143 | SIGTERM — graceful stop |

**Container exits immediately** → `docker logs` first, always. Then: application error on boot ·
missing required env var · wrong `CMD` · the process daemonizes instead of staying foreground ·
architecture mismatch (`exec format error`) · OOM (137).

**Can't connect** → is the port published (`docker ps`)? · is the app bound to `0.0.0.0`? · is the
host:container order right? · is the app actually listening?

**Containers can't reach each other** → same network? · using service name rather than `localhost`?
· is the dependency ready, or just started?

**Data disappears on restart** → written to the writable layer instead of a volume.

**Build is slow** → check context size in the build output · check `.dockerignore` · check cache
ordering · look for cache-busting instructions early in the file.

**Works locally, fails elsewhere** → architecture mismatch · missing runtime env var · a bind mount
masking a path that does not exist elsewhere · image built from uncommitted local files.

**Useful commands**
```
docker logs -f --tail 200 <id>
docker exec -it <id> sh
docker inspect <id>                 # State.OOMKilled, mounts, env, network
docker history <image>              # layer sizes, leaked build args
docker stats
docker build --progress=plain --no-cache
docker system df                    # where disk went
```
