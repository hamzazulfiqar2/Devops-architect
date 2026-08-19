# Docker — Build, Registry, and Tagging

---

## The Commands

| Command | What it does |
|---|---|
| `docker build -t <name>:<tag> .` | Reads the Dockerfile and build context, produces an image |
| `docker tag <src> <dest>` | Adds another name pointing at the **same** image. Copies nothing |
| `docker push <name>:<tag>` | Uploads layers the registry does not already have |
| `docker pull <name>:<tag>` | Downloads layers not already cached locally |

**Useful build flags**
```
--platform linux/amd64          # target architecture — critical on Apple Silicon
--target build                  # stop at a named multi-stage target
--build-arg VERSION=1.2.3       # build-time value (visible in history — never a secret)
--no-cache                      # force a full rebuild
--progress=plain                # full output; essential for debugging a failing step
--cache-from / --cache-to       # BuildKit remote cache, for CI
```

---

## Tags vs Digests

| | Tag | Digest |
|---|---|---|
| Example | `myapp:a1b2c3d` | `myapp@sha256:9f8e7d...` |
| Mutability | **Movable** — can be repointed at a different image | **Immutable** — content-addressed |
| Use | Human-readable reference | Guaranteed identity |

A tag is a label on a shelf; a digest is the item itself. **Deploy by digest where integrity
matters**, and record the digest in the deployment plan.

---

## Tagging Strategy

| Tag | Mutability | Purpose |
|---|---|---|
| **`<git-sha>`** | **Immutable** | The identity. What gets deployed and rolled back to |
| `1.4.2` (semver) | Immutable | Released artifacts and libraries |
| `staging` / `production` | Moving pointer | Convenience — **points at** a SHA tag, never replaces it |
| `latest` | Moving | **Never in production** |

**Why `:latest` is banned in production**
- Mutable, so the same tag means different things over time
- Deploys become non-deterministic — you cannot say what is running
- **Rollback becomes guesswork** — you cannot roll back to a tag whose meaning has changed
- With Kubernetes `imagePullPolicy: Always`, a pod restart can silently change versions
- It defeats layer caching and makes incident forensics impossible

**Build once, promote the same artifact.** Tag with the git SHA at build time and promote that
exact image (ideally by digest) through dev → staging → production. **Rebuilding per environment
means production runs something nobody tested.**

---

## Registries

| Registry | Notes |
|---|---|
| **Amazon ECR** | IAM-integrated, scan-on-push, lifecycle policies. The natural choice on AWS |
| Docker Hub | Public images. **Rate-limited for anonymous pulls** — a real cause of CI failures |
| GitHub Container Registry | Convenient alongside GitHub Actions |
| Self-hosted (Harbor, Nexus) | Only when there is a stated requirement |

---

## Amazon ECR

**Authentication**
```bash
aws ecr get-login-password --region <region> \
  | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
```
**Tokens expire after 12 hours** — a long-running pipeline can fail mid-way on an expired token.

**Must-configure settings**

| Setting | Why |
|---|---|
| **Lifecycle policy** | Without one, every CI build's image stays forever. 20 images/day at 500 MB ≈ **3 TB/year**. Typical rule: keep the last 10 tagged, expire untagged after 7 days |
| **Scan on push** | Free basic vulnerability scanning — a second net behind CI scanning |
| **Tag immutability** | A tag cannot be repointed under a running deployment |

**IAM notes**
- `ecr:GetAuthorizationToken` is **account-level and cannot be resource-scoped** — put it in its own
  statement, then scope push/pull to specific repository ARNs
- Prefer OIDC-based CI authentication over long-lived access keys
- Cross-account pulls need a repository policy on the ECR side

**Networking:** pulling from a **private subnet** needs a NAT route, or three VPC endpoints —
`ecr.api`, `ecr.dkr`, **and the S3 gateway endpoint** (image layers live in S3). Missing the S3
endpoint is a very common "why can't my task pull images" cause.

**Cost:** storage per GB-month, plus data transfer out. Lifecycle policies are the main lever.

---

## Scanning

**Scan in CI *before* pushing to the registry**, so a vulnerable image never lands. ECR
scan-on-push is a second net, not the primary control.

Tools: Trivy · Grype · ECR basic and enhanced scanning · Snyk.

**Decide block-vs-report explicitly.** Blocking on every transitive CVE stops all work; blocking on
critical severity in production paths is reasonable. State the policy rather than leaving it
implicit.

Prefer minimal base images — every package is attack surface — and rebuild periodically, since a
base image accumulates CVEs even when your code has not changed.

---

## CI Build Pipeline Shape

```
checkout → install (cached) → lint → test
        → docker build (tag: <git-sha>, --platform linux/amd64)
        → image scan ──fail on critical──▶ stop
        → docker push to ECR
        → deploy that exact tag/digest
```

**Two rules the order encodes:** scan **before** push, and build **once** before any environment
sees it.

**Speed:** BuildKit with `--cache-from`/`--cache-to type=gha` — a fresh CI runner has no local cache,
so without a remote cache every build starts from zero.

---

## Common Mistakes

- `:latest` anywhere near production
- Rebuilding the image per environment instead of promoting one artifact
- No ECR lifecycle policy — storage grows forever and silently
- Scanning after the push, so the vulnerable image is already available to pull
- Building on Apple Silicon without `--platform linux/amd64` → `exec format error` at runtime
- No remote build cache in CI, so every build is a cold build
- Granting `ecr:*` on `*` instead of scoping to repositories
- Missing the S3 gateway endpoint for private-subnet pulls
- Docker Hub rate limits breaking CI on anonymous pulls
