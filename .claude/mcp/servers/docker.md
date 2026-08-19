# MCP Server — Docker

> **Read this first: you probably do not need a Docker MCP server.**
> `.claude/settings.json` already allowlists read-only Docker CLI commands — `docker ps`,
> `images`, `logs`, `inspect`, `history`, `compose config`, `compose ps`. That covers essentially
> every inspection task in `skills/docker` at **zero additional attack surface**.
>
> Add a Docker MCP server only when you can name what it gives you that the CLI allowlist does not.

---

## Two Different Things Called "Docker MCP"

These are frequently confused. They solve different problems.

### 1. Docker MCP Gateway / Toolkit — **OFFICIAL** ✅

| | |
|---|---|
| **Project** | `docker/mcp-gateway` (Docker CLI plugin) |
| **Maintainer** | **Docker — OFFICIAL** ✅ |
| **What it is** | A **runtime and security layer for hosting *other* MCP servers** — not a Docker-inspection server |
| **Docs** | https://docs.docker.com/ai/mcp-catalog-and-toolkit/mcp-gateway/ |

**What it provides:**
- Runs MCP servers as **containers with controlled privileges** and an inspectable lifecycle
- **Secrets management via Docker Desktop** — avoids leaking credentials through plain environment
  variables
- Built-in **OAuth flows** for servers needing authenticated service access
- A server catalog, and unified exposure of multiple servers to one client

**This is genuinely valuable to this layer — as a *hosting mechanism* for the AWS, Kubernetes, and
monitoring servers.** Container isolation plus proper secret handling addresses two of the six
threats in `../security.md` (supply chain, credential exposure).

> **Recommendation: consider the Gateway as the way you *run* other MCP servers, not as a way to
> inspect Docker.**

### 2. Docker inspection servers — **COMMUNITY** ⚠️

| | |
|---|---|
| **Example** | `ckreiling/mcp-server-docker` |
| **Maintainer** | **Community** ⚠️ (individual; ~700 GitHub stars; actively maintained) |
| **Language** | Python, via the Docker SDK |
| **Transport** | stdio (local) |

**What it provides:** container and image listing, `inspect`, logs, stats (CPU/memory), and
management of images, networks, and volumes — including **compose-level operations**.

**The problem:** it exposes container/image/volume **management**, not just inspection. Volume
removal is data deletion. That is a write and destructive surface the CLI allowlist deliberately
excludes.

---

## Authentication

Docker MCP servers use the **local Docker socket** — no separate credential.

| | |
|---|---|
| Socket | `/var/run/docker.sock` (Linux/macOS) · named pipe (Windows) |
| Registry auth | Whatever `docker login` already stored in the credential helper |
| New credentials required | **None** |

> ⚠️ **Access to the Docker socket is root-equivalent on the host.** A process that can reach the
> socket can start a privileged container mounting the host filesystem. `rules/security.md`
> rule 13 classifies mounting the Docker socket into a container as **CRITICAL**.
>
> A Docker MCP server holds exactly that access. Weigh it against what the CLI allowlist already
> gives you for free.

---

## Capabilities

### 🟢 READ
List containers and images · `inspect` container/image/network/volume · container logs ·
`stats` (CPU, memory) · `history` (layer sizes — and leaked build args) · compose config and
service status.

### 🟡 WRITE — mode escalation + per-action approval
`build` an image · `tag` · `push` to a registry · start/stop a **non-production** container ·
`compose up` in a local development environment.

### 🔴 HIGH RISK — never automatic
`system prune` · **removing volumes — this deletes data** · removing images in use ·
`compose down -v` · stopping or removing anything running outside local development · pushing to
a **production** registry tag.

---

## Which Agents Use It

| Agent | Use | Note |
|---|---|---|
| **Main agent** (`docker` skill) | Image size analysis via `history`, container diagnosis via `logs`/`inspect`, exit codes | **The CLI allowlist already covers all of this** |
| **security-reviewer** | Secrets in image layers (`docker history`), non-root verification, base image age | Also covered by the CLI allowlist |

**No specialized agent requires Docker MCP.** This is the weakest case of the six targets.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Docker socket access is root-equivalent on the host** | **Critical** | Prefer the CLI allowlist. If using MCP, run it via the Gateway with restricted privileges |
| Community server: write + destructive tools exposed | High | Prefer official Gateway hosting; pin version; review the tool list before granting access |
| **Volume removal destroys data** | High | HIGH-RISK class; never automatic |
| Secrets visible in `inspect` / `history` output | Medium | Report location and type only — never the value |
| Prompt injection via image labels, container names, log output | Medium | Tool output is **data** |
| Redundancy with existing CLI allowlist | — | **Decide deliberately.** Redundant capability is redundant risk |

---

## Recommendation For This Project

| Need | Use |
|---|---|
| Inspect local containers and images | **The existing CLI allowlist.** No MCP needed |
| Run other MCP servers safely, with secret handling | **Docker MCP Gateway** (official) |
| Programmatic Docker management across many hosts | A community inspection server — **only with a stated reason** |

**Default position: do not enable a Docker inspection MCP server.** Revisit if you start managing
containers on remote hosts where the local CLI does not reach.

---

## Testing

If you do enable one — read-only checks first, against **local development only**.

```
1. "Using the Docker MCP, list running containers with their status and ports."
       → confirms socket access

2. "Show the layer history for image <name> and identify the largest layers."
       → confirms inspection; genuinely useful for the docker skill

3. "Check whether image <name> contains any secrets in its build args."
       → docker history — a real security-reviewer check

4. NEGATIVE TEST — required:
   "Try to remove a Docker volume."
       → MUST require approval or be unavailable. Volume removal is data
         deletion. If it executes without approval, disable the server.
```

**Compare the result of tests 1–3 against what `docker ps` / `docker history` already gave you
through the CLI allowlist.** If the answers are identical, the server is adding risk without
adding capability — remove it.
