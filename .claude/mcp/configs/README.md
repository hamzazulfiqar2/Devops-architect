# MCP Configuration

**No credential, token, key, kubeconfig, or password belongs in this directory — or anywhere in
this repository.**

This directory holds **example** configuration only. Every value is a placeholder or an
environment-variable reference.

---

## The Rule

| ✅ Safe to commit | ❌ Never commit |
|---|---|
| `${GITHUB_PERSONAL_ACCESS_TOKEN}` — a reference | `ghp_xxxxxxxxxxxx` — a value |
| `AWS_API_MCP_PROFILE_NAME: "devops-readonly"` — a profile *name* | `AWS_SECRET_ACCESS_KEY: "..."` |
| `GRAFANA_URL: "https://grafana.example.com"` | `GRAFANA_SERVICE_ACCOUNT_TOKEN: "glsa_..."` |
| A path to a kubeconfig | Kubeconfig **contents** |

**A profile name, a URL, and a variable reference are not secrets. A token is.**

If a secret is ever committed, it is **compromised** — rotate it, do not merely delete it. Git
history retains it (`rules/security.md` rule 3).

---

## Where Configuration Lives

Claude Code reads MCP servers from `.mcp.json` at the project root.

| File | Committed? | Contains |
|---|---|---|
| `.mcp.json` | ✅ Yes — **if it only holds `${VAR}` references** | Server definitions |
| `.env` / `.env.local` | ❌ **Never** | The actual values |
| `.mcp.local.json` | ❌ Never | Any local override with literals |
| `~/.aws/config`, `~/.kube/config` | ❌ Outside the repo entirely | Native credentials |

---

## Example — `.mcp.json` (safe to commit as written)

```jsonc
{
  "mcpServers": {
    // GitHub — official, remote hosted, READ-ONLY toolsets
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/readonly",
      "headers": {
        "Authorization": "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    },

    // AWS — official (awslabs), local stdio, READ-ONLY
    "aws": {
      "command": "uvx",
      "args": ["awslabs.aws-api-mcp-server@<pinned-version>"],
      "env": {
        "AWS_API_MCP_PROFILE_NAME": "<your-readonly-profile>",
        "AWS_REGION": "<your-region>",
        "READ_OPERATIONS_ONLY": "true",
        "REQUIRE_MUTATION_CONSENT": "true"
      }
    },

    // AWS documentation — official, NO CREDENTIALS REQUIRED
    "aws-docs": {
      "command": "uvx",
      "args": ["awslabs.aws-documentation-mcp-server@<pinned-version>"]
    },

    // Terraform — official, registry only, OPERATIONS DISABLED
    "terraform": {
      "command": "<path-or-runner>",
      "args": ["terraform-mcp-server"],
      "env": {
        "ENABLE_TF_OPERATIONS": "false"
      }
    },

    // Kubernetes — vendor-backed, READ-ONLY + cluster-reader RBAC
    "kubernetes": {
      "command": "kubernetes-mcp-server",
      "args": ["--read-only"],
      "env": {
        "KUBECONFIG": "${KUBECONFIG_READONLY_PATH}"
      }
    },

    // Grafana — official, WRITE DISABLED
    "grafana": {
      "command": "mcp-grafana",
      "args": ["--disable-write"],
      "env": {
        "GRAFANA_URL": "<your-grafana-url>",
        "GRAFANA_SERVICE_ACCOUNT_TOKEN": "${GRAFANA_SERVICE_ACCOUNT_TOKEN}"
      }
    }
  }
}
```

**Notes on the example**
- Every `<placeholder>` must be replaced; every `${VAR}` is resolved from your environment
- **Pin versions.** `@<pinned-version>`, never `@latest`
- Safety flags are set to their restrictive values **in the committed file**, so the safe posture
  is the default anyone inherits
- Docker MCP is deliberately absent — see `../servers/docker.md`

---

## Supplying The Values

In order of preference.

### 1. Native authentication (best — nothing new to store)

| System | Mechanism |
|---|---|
| **AWS** | `aws sso login`, then reference the profile by name. Short-lived credentials |
| **GitHub** | **OAuth** via the remote or Docker server — no token exists at all |
| **Kubernetes** | An existing kubeconfig context using a read-only ServiceAccount |
| **Docker** | The local socket and `docker login` credential store |
| **Terraform** | `terraform login` writes a credentials file outside the repo |

### 2. OS keychain / secret manager

macOS Keychain · Windows Credential Manager · `pass` · 1Password CLI · AWS Secrets Manager.
Export into the environment at shell start; nothing lands on disk in plaintext.

### 3. Docker MCP Gateway secret handling

The official Gateway manages secrets for containerized MCP servers, avoiding plain environment
variables. See `../servers/docker.md`.

### 4. An untracked local env file (acceptable, weakest)

```bash
# .env.local — GITIGNORED, never committed
GITHUB_PERSONAL_ACCESS_TOKEN=...
GRAFANA_SERVICE_ACCOUNT_TOKEN=...
KUBECONFIG_READONLY_PATH=/absolute/path/to/readonly-kubeconfig
```

Environment variables are visible in process listings — hence last place.

---

## Required `.gitignore`

**This repository has no `.gitignore` yet. Add one before configuring any MCP server.**

```gitignore
# Secrets — never commit
.env
.env.*
!.env.example
.mcp.local.json
*.local.json
*.pem
*.key
credentials

# Cloud / cluster credentials
.aws/credentials
kubeconfig
*.kubeconfig

# Terraform
*.tfstate
*.tfstate.*
.terraform/
*.tfvars
!*.tfvars.example
*.tfplan
```

---

## Credentials You Need — By Server

| Server | Credential | How to create it | Scope |
|---|---|---|---|
| **GitHub** | Fine-grained PAT, or OAuth | GitHub → Settings → Developer settings → Fine-grained tokens | **Read-only**, specific repositories |
| **AWS** | SSO profile, or IAM role | `aws configure sso` | `ReadOnlyAccess` or narrower |
| **AWS docs** | **None** | — | — |
| **Kubernetes** | Kubeconfig context | ServiceAccount + `view`/`cluster-reader` ClusterRoleBinding | Read-only, one cluster |
| **Terraform (registry)** | **None** | — | — |
| **Terraform (HCP/TFE)** | `TFE_TOKEN` | HCP Terraform → user settings → tokens | Specific workspaces |
| **Grafana** | Service account token | Grafana → Administration → Service accounts | **Viewer** role |
| **Docker** | None (local socket) | — | ⚠️ Socket access is root-equivalent |

---

## Verify Before You Trust

After configuring any server, run **both** checks from that server's `servers/*.md` file:

1. **The identity check** — *which* account, cluster, org, or repo scope am I actually using?
2. **The negative test** — attempt a write. **It must fail.**

A read-only configuration that has never been tested against a write attempt is an assumption,
not a control. Both checks are documented per server.

---

## Enabling Order

Add servers one at a time, testing each before the next.

| Order | Server | Why |
|---|---|---|
| 1 | **AWS documentation** | Zero credentials, zero risk — proves MCP works at all |
| 2 | **Terraform (registry only)** | No credentials; immediately useful for current provider schemas |
| 3 | **GitHub (read-only)** | High value, well-scoped credential |
| 4 | **AWS API (read-only)** | High value; requires careful IAM scoping |
| 5 | **Monitoring** | High value for incidents; needs a real observability stack |
| 6 | **Kubernetes (read-only)** | Only if you run a cluster. Requires RBAC setup first |
| — | **Docker** | Probably skip — the CLI allowlist already covers it |

**Nothing here is required.** The agent works fully without MCP; this layer only widens what it
can see.
