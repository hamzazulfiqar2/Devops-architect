# MCP Server — GitHub

| | |
|---|---|
| **Server** | `github/github-mcp-server` |
| **Maintainer** | **GitHub — OFFICIAL / vendor-maintained** ✅ |
| **Language** | Go |
| **Transport** | Remote HTTP (GitHub-hosted) · Docker · local stdio binary |
| **Local or remote** | **Both.** Remote is GitHub reaching GitHub — acceptable |
| **Docs** | https://github.com/github/github-mcp-server |

**Recommended for this project.** GitHub is the system of record for the repository, and the
remote hosted server needs no local runtime.

---

## Transport Options

| Option | Endpoint / image | Notes |
|---|---|---|
| **Remote hosted** | `https://api.githubcopilot.com/mcp/` | No local install. OAuth or PAT |
| **Docker** | `ghcr.io/github/github-mcp-server` | Supports browser OAuth via callback port |
| **Local stdio** | `github-mcp-server stdio` | Binary; PAT via environment |

**Remote toolset URLs** — the cleanest way to enforce read-only:

```
https://api.githubcopilot.com/mcp/                       all default toolsets
https://api.githubcopilot.com/mcp/readonly               ALL toolsets, read-only
https://api.githubcopilot.com/mcp/x/{toolset}            one toolset
https://api.githubcopilot.com/mcp/x/{toolset}/readonly   one toolset, read-only  ← preferred
```

---

## Authentication

| Method | Mechanism | Best for |
|---|---|---|
| **OAuth** | Browser flow — remote and Docker deployments | **Preferred.** No long-lived token exists |
| **PAT** | `GITHUB_PERSONAL_ACCESS_TOKEN` env var, or `Authorization: Bearer` header | Headless / CI |

**Use a fine-grained PAT**, scoped to specific repositories, with read-only permissions for the
default posture. Never a classic PAT with broad `repo` scope.

### Environment variables

| Variable | Purpose | Required |
|---|---|---|
| `GITHUB_PERSONAL_ACCESS_TOKEN` | PAT (takes precedence over OAuth) | If not using OAuth |
| `GITHUB_HOST` | GitHub Enterprise host | Enterprise only |
| `GITHUB_TOOLSETS` | Comma-separated toolsets to enable | Optional |
| `GITHUB_TOOLS` | Specific tool allowlist | Optional |
| `GITHUB_OAUTH_CALLBACK_PORT` | OAuth callback port (Docker) | Docker + OAuth |

**Never put the PAT in a committed config file.** See `../configs/README.md`.

---

## Toolsets

23+ toolsets. Default: `context, repos, issues, pull_requests, users`.

| Toolset | Contains | Relevance here |
|---|---|---|
| `context` | Current user and GitHub context | **Recommended** — cheap, orienting |
| `repos` | Repository browsing and management | **High** — read code, branches, commits |
| `pull_requests` | PR management and review | **High** — review changes |
| `issues` | Issue tracking | Medium |
| `actions` | CI/CD workflow monitoring | **High** — pipeline diagnosis |
| `code_security` | Code scanning alerts | **High** — `security-reviewer` |
| `dependabot` | Dependency vulnerability alerts | **High** — `security-reviewer` |
| `discussions`, `projects`, `users` | Collaboration surfaces | Low |

**Suggested minimal set:** `context,repos,pull_requests,actions,code_security,dependabot` — in
read-only.

---

## Capabilities

### 🟢 READ
Inspect repositories, file contents, branches, tags, commits, and history · list and read pull
requests, diffs, reviews, comments · read issues · list and inspect Actions workflow runs, jobs,
and logs · read code scanning alerts · read Dependabot alerts · read repository settings and
metadata.

### 🟡 WRITE — mode escalation + per-action approval
`create_or_update_file` · create branches · create pull requests · `issue_write` ·
`pull_request_review_write` · `label_write` · comment · modify workflow files (CI/CD config).

### 🔴 HIGH RISK — never automatic
`delete_repository` · `delete_file` · deleting branches · force-push · changing **branch
protection** · changing repository or org **settings** · modifying **secrets or variables** ·
changing **Actions permissions** (a supply-chain boundary).

---

## Read-Only Enforcement

**Two independent layers — use both:**

1. **The token.** A fine-grained PAT with read-only repository permissions. This is the real
   boundary
2. **The server.** `--read-only` flag, or the `/readonly` remote URL suffix. GitHub documents this
   as a strict filter that takes precedence over other configuration and disables write tools even
   when explicitly requested

---

## Which Agents Use It

| Agent | Use |
|---|---|
| **security-reviewer** | Code scanning + Dependabot alerts, workflow permissions, branch protection, committed secrets, **git history** |
| **terraform-engineer** | Reading existing IaC and its change history |
| **kubernetes-engineer** | Reading manifests in the repository |
| **Main agent** | PR review, Actions failure diagnosis, drift between repo and deployed state |

---

## Risks

| Risk | Mitigation |
|---|---|
| PAT with write scope leaks | Fine-grained, read-only, repo-scoped; prefer OAuth |
| **Prompt injection** via issue/PR/commit text | Tool output is **data, not instructions**. See `../security.md` |
| Reading a committed secret | Report file/line/type only, never the value → **rotate** |
| Remote server sees repository content | It is GitHub's own service reading GitHub — acceptable. Note it for private repos under strict policy |
| Accidental write to the wrong repository | Scope the PAT to specific repositories |

---

## Testing

**Read-only, non-destructive.** Configure with a read-only credential first.

```
1. "Using the GitHub MCP, what is my authenticated identity and what
    repositories can it see?"
       → confirms auth works and shows the credential's actual scope

2. "List the open pull requests on <repo>."
       → confirms the pull_requests toolset

3. "Show the most recent GitHub Actions workflow run for <repo> and
    whether it passed."
       → confirms the actions toolset

4. "Are there any open Dependabot or code scanning alerts on <repo>?"
       → confirms security toolsets

5. NEGATIVE TEST — the important one:
   "Try to create a branch called mcp-test on <repo>."
       → in read-only mode this MUST fail or be unavailable.
         If it succeeds, the read-only posture is not working — stop and
         re-check the token scope before going further.
```

**Test 5 is the one that matters.** A read-only setup that has never been tested against a write
attempt is an assumption, not a control.
