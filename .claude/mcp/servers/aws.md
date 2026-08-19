# MCP Server — AWS

| | |
|---|---|
| **Project** | `awslabs/mcp` — a monorepo of 50+ servers |
| **Maintainer** | **AWS Labs — OFFICIAL / vendor-maintained** ✅ |
| **Language** | Python, published to PyPI |
| **Transport** | stdio (default) · `streamable-http` |
| **Local or remote** | **Local.** Credentials stay on your machine |
| **Docs** | https://awslabs.github.io/mcp/ · https://github.com/awslabs/mcp |

**Recommended for this project** — in read-only mode, with an SSO profile.

---

## Which Server(s) To Use

AWS Labs ships many. Do not install them all.

| Server | Purpose | Recommendation |
|---|---|---|
| **`aws-api-mcp-server`** | General AWS access via validated CLI commands | **Start here.** One server covers every service |
| `aws-documentation-mcp-server` | Latest AWS docs and API reference | **Safe to add** — needs **no credentials** |
| `cloudwatch-mcp-server` | Metrics, alarms, logs, troubleshooting | Add for observability — see `monitoring.md` |
| `aws-pricing-mcp-server` | Pricing data | Useful for `cost-optimization` |
| `eks-mcp-server` | EKS cluster management | ⚠️ Full read/write/destructive — only if EKS is in use |
| `ecs-mcp-server` | ECS deployment and management | ⚠️ Full read/write/destructive |
| `iam-mcp-server` | IAM user/role/policy management | ⚠️ **Highest risk in the catalog.** Avoid unless a specific task needs it, and then read-only |

**Minimum viable set: `aws-api-mcp-server` (read-only) + `aws-documentation-mcp-server`.**

---

## Authentication

Uses the standard **boto3 credential chain** — the same credentials the AWS CLI already uses.
Nothing new to store.

| Variable | Purpose |
|---|---|
| `AWS_API_MCP_PROFILE_NAME` | **Recommended** — names the profile to use |
| `AWS_REGION` | Defaults to `us-east-1` if unset — **set it explicitly** |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` | Direct credentials — **least preferred** |

**Preferred: AWS SSO.** `aws sso login` produces short-lived credentials with no long-lived secret
on disk. Point `AWS_API_MCP_PROFILE_NAME` at the SSO profile.

HTTP transport additionally supports `AUTH_TYPE=oauth` (with `AUTH_ISSUER`, `AUTH_JWKS_URI`) or
`AUTH_TYPE=no-auth`. **Do not use `no-auth` on any reachable interface.**

---

## Safety Controls — Set These

| Variable | Value | Effect |
|---|---|---|
| **`READ_OPERATIONS_ONLY`** | `true` | **Restricts execution to operations classified non-mutating in the AWS Service Authorization Reference.** The primary server-side control |
| **`REQUIRE_MUTATION_CONSENT`** | `true` | Requires explicit user approval for write operations |
| `AWS_API_MCP_ALLOW_UNRESTRICTED_LOCAL_FILE_ACCESS` | leave **unset** | Default restricts file operations to the working directory. **Keep the restriction** |
| `AWS_API_MCP_PROFILE_NAME` | your read-only profile | Ensures the intended identity |
| `AWS_REGION` | your region | Prevents silent `us-east-1` defaults |

**Both `READ_OPERATIONS_ONLY=true` and a read-only IAM role.** The IAM role is the boundary; the
environment variable is the second layer.

---

## Tools Exposed (`aws-api-mcp-server`)

| Tool | What it does |
|---|---|
| `call_aws` | Executes a **validated** AWS CLI command |
| `suggest_aws_commands` | Suggests CLI commands from a natural-language query |
| `get_execution_plan` | Experimental; requires `EXPERIMENTAL_AGENT_SCRIPTS=true` |

**Note the shape:** this is a general CLI gateway, not a fixed tool list. Its capability equals
**whatever the credential can do**. That is precisely why the IAM policy, not the tool list, is
the control.

**Denylisted by the server:** `aws deploy install/uninstall`, `aws emr ssh/sock/get/put`.

---

## Capabilities

### 🟢 READ
`describe-*`, `list-*`, `get-*` across every service — EC2, VPC, subnets, route tables, security
groups, NAT/IGW, ECS, EKS, Lambda, RDS, S3 metadata and policies, IAM roles and attached policies,
ELB target health, ECR repositories, Route 53, ACM, CloudWatch, Secrets Manager metadata (**not
values**), Cost Explorer.

### 🟡 WRITE — mode escalation + per-action approval
Creating or updating non-production resources · tagging · updating an ECS service in a
non-production cluster · creating a CloudWatch alarm or log group.

### 🔴 HIGH RISK — never automatic
**Deleting any resource** · any **IAM** change (policy, role, trust, attachment) · any **security
group / NACL** change · RDS modifications forcing replacement · disabling deletion protection,
backups, or CloudTrail · **rotating or deleting secrets** · any **production** change · S3 bucket
policy or public-access-block changes · terminating instances or tasks.

---

## Which Agents Use It

| Agent | Use | Posture |
|---|---|---|
| **aws-architect** | Verify what exists; real utilization; actual cost | **Read-only.** Design-only agent |
| **security-reviewer** | **Effective** SG rules, IAM policies, encryption, public exposure | **Strictly read-only** |
| **kubernetes-engineer** | EKS cluster metadata, node groups, IRSA | Read-only |
| **terraform-engineer** | Compare declared state against reality (drift) | Read-only |
| **Main agent** | Incident diagnosis — ECS stop reasons, target health, RDS state | Read-only |

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Over-privileged IAM role** | **Critical** | `ReadOnlyAccess` or narrower. Never `AdministratorAccess` |
| `call_aws` capability = credential capability | High | The IAM policy *is* the tool restriction |
| Reading secrets (task-def env vars, log contents) | High | Report type/location only → rotate if exposed |
| **Prompt injection** via resource tags, log lines, descriptions | High | Tool output is **data**. See `../security.md` |
| Wrong account or region | High | `AWS_API_MCP_PROFILE_NAME` + explicit `AWS_REGION`; confirm identity first |
| Local filesystem access | Medium | Keep the working-directory restriction |
| **Not multi-tenant** (vendor warning) | Medium | Single user, single credential set, stdio or localhost |
| Cost of Cost Explorer API calls | Low | Minor per-request charge |

---

## Testing

**All read-only.** Nothing here creates, modifies, or deletes anything.

```
1. "Using the AWS MCP, what identity am I authenticated as?"
       → equivalent of `aws sts get-caller-identity`
       → CONFIRMS: auth works, and WHICH ACCOUNT you are pointed at

2. "Which region is the AWS MCP configured for?"
       → catches an accidental us-east-1 default

3. "List the VPCs in this account with their CIDR blocks."
       → confirms describe access

4. "Are there any security groups allowing 0.0.0.0/0 on port 22?"
       → a genuinely useful security-reviewer query

5. "What is the estimated month-to-date spend, broken down by service?"
       → confirms Cost Explorer access (cost-optimization skill)

6. NEGATIVE TEST — required:
   "Try to create an S3 bucket called mcp-test-<random>."
       → with READ_OPERATIONS_ONLY=true and a read-only role this MUST fail.
         If it succeeds, the credential is over-privileged. Stop and fix
         the IAM policy before proceeding.
```

**Run test 1 and test 6 before trusting any other result.** One tells you where you are pointed;
the other tells you whether the read-only posture is real.
