# Docker References — Index

| File | Covers |
|---|---|
| `images-and-layers.md` | Images, containers, layers, build cache, build context |
| `dockerfile.md` | Instructions, base image selection, multi-stage builds, environment variables |
| `registry-and-tagging.md` | build, tag, push, pull, registries, ECR, tagging strategy |
| `runtime-and-compose.md` | Volumes, networks, ports, healthchecks, signals, Docker Compose |
| `security-and-production.md` | Non-root, secrets, scanning, hardening, production checklist |

---

## The Image Lifecycle

```
Dockerfile
   │  docker build          reads the Dockerfile + build context
   ▼
Image (layers)             immutable filesystem snapshot + metadata
   │  docker tag           gives it a name the registry understands
   ▼
Tagged image
   │  docker push          uploads layers not already present
   ▼
Registry (ECR)
   │  docker pull          downloads layers not already cached
   ▼
Container runtime          ECS task / Kubernetes pod / docker run
```

**The key insight:** the image is **immutable**. Configuration and secrets are injected at
**runtime**, not baked in — which is what lets the same artifact run in dev, staging, and
production. If an image only runs in one environment, the boundary is broken.

---

## Core Concepts In One Line Each

| Term | Meaning |
|---|---|
| **Image** | A frozen filesystem snapshot plus the command to run. Like a recipe's finished cake, boxed |
| **Container** | A running instance of an image. Delete it and the image is untouched |
| **Layer** | Each Dockerfile instruction adds a stacked, read-only filesystem slice. Cached and shared |
| **Build cache** | Docker reuses a layer if its instruction and inputs are unchanged. Change something early and everything after rebuilds |
| **Build context** | The folder handed to `docker build`. Everything in it is sent to the builder first |
| **Registry** | A warehouse for images — Docker Hub, ECR, GHCR |
| **Tag** | A movable pointer to an image. **A digest is the immutable identity** |
| **Volume** | Storage outside the container, so data survives the container's death |

---

## When Docker Is Warranted

**Yes:** the target is ECS, EKS, or any container runtime · reproducible builds matter · the runtime
has awkward system dependencies · dev/prod parity is a goal.

**Not necessarily:** the target is Lambda with a zip package · the deliverable is static files to
S3+CloudFront · the platform builds from source itself (App Runner from a repo, Vercel).

Do not containerize by reflex. State the decision and the reason.

---

## The Rules That Matter Most

1. **Never `:latest` in production** — mutable tags make deploys non-deterministic and rollback
   guesswork
2. **Never secrets in the image** — `ENV` and `ARG` are visible in `docker history`, and a file
   deleted in a later layer is still in an earlier one
3. **Non-root user** — a container escape from root is dramatically worse
4. **Multi-stage builds** — the single biggest lever on both size and attack surface
5. **Bind to `0.0.0.0`, not `127.0.0.1`** — otherwise the app is unreachable from outside the
   container
6. **Exec-form `CMD`** — shell form swallows `SIGTERM` and turns every stop into a 10-second kill
