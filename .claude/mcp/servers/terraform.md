# MCP Server — Terraform

| | |
|---|---|
| **Server** | `hashicorp/terraform-mcp-server` |
| **Maintainer** | **HashiCorp — OFFICIAL / vendor-maintained** ✅ |
| **Transport** | stdio (default) · `streamable-http` |
| **Local or remote** | **Local**; reaches the public registry and optionally HCP Terraform / TFE |
| **Docs** | https://developer.hashicorp.com/terraform/mcp-server |

**Recommended — with `ENABLE_TF_OPERATIONS=false` (the default), permanently.**

---

## What It Actually Does — Read This Carefully

**The Terraform MCP server does NOT run `terraform apply` or `terraform destroy` against your
local configuration.** It has no local execution path at all.

It does two things:

1. **Registry access** — current provider documentation, resource and data-source schemas, module
   search and versions, Sentinel policies. This is its highest-value use: correct, current
   argument names instead of recalled ones.
2. **HCP Terraform / Terraform Enterprise access** — workspaces, runs, plan output, variables,
   policy sets. Read-only unless operations are explicitly enabled.

> ⚠️ **The one path to an apply:** if you use HCP Terraform / TFE *and* set
> `ENABLE_TF_OPERATIONS=true`, the `create_run` tool supports a `plan_and_apply` run type, and
> `action_run` can apply/discard/cancel. **That is a real apply against real infrastructure.**
>
> `rules/production-rules.md` rule 2 and the `terraform-engineer` agent's absolute rule both
> forbid it. **Keep `ENABLE_TF_OPERATIONS=false`.**

---

## Authentication

| Variable | Purpose | Required |
|---|---|---|
| `TFE_TOKEN` | HCP Terraform / Terraform Enterprise API token | Only for HCP/TFE features |
| `TFE_ADDRESS` | Endpoint; defaults to `app.terraform.io` | TFE self-hosted only |
| `ENABLE_TF_OPERATIONS` | **Gates all write/destructive tools. Default `false`** | **Leave false** |
| `TRANSPORT_MODE` | `stdio` or `streamable-http` | Optional |

**Registry-only use requires no credentials at all** — the safest starting configuration, and
enough for most of what `skills/terraform` needs.

Token source: `terraform login`, or an environment variable from an untracked local file.
**Never commit `TFE_TOKEN`.**

---

## Tools

### 🟢 READ — no credential needed (registry)
`search_providers` · `get_provider_details` · `get_latest_provider_version` · `search_modules` ·
`get_module_details` · `get_latest_module_version` · `search_policies` · `get_policy_details`

### 🟢 READ — requires `TFE_TOKEN` (HCP/TFE)
`list_terraform_orgs` · `list_terraform_projects` · `list_workspaces` · `get_workspace_details` ·
`list_runs` · `get_run_details` · **`get_plan_json_output`** · **`get_plan_details`** ·
`get_plan_logs` · `get_apply_details` · `get_apply_logs` · `list_variable_sets` ·
`list_workspace_variables` · `get_workspace_policy_sets` · `read_workspace_tags` ·
`get_token_permissions` · `search_private_modules` · `get_private_module_details` ·
`search_private_providers` · `get_private_provider_details` · `list_stacks` · `get_stack_details`

> **`get_plan_json_output` is the highest-value tool here.** It lets the agent read a plan
> programmatically and surface `forces replacement` / `will be destroyed` **before** anyone
> approves — exactly what `production-rules.md` rule 11 requires.

### 🟡 WRITE — gated behind `ENABLE_TF_OPERATIONS=true`
`create_workspace` · `update_workspace` · `create_variable_set` ·
`create_variable_in_variable_set` · `create_workspace_variable` · `update_workspace_variable` ·
`attach_policy_set_to_workspace` · `attach_variable_set_to_workspaces` · `create_workspace_tags`

### 🔴 HIGH RISK — never automatic, never enabled by default
**`create_run` with `plan_and_apply`** · **`action_run` (apply / discard / cancel)** ·
`delete_workspace_safely` · `delete_variable_in_variable_set` ·
`detach_variable_set_from_workspaces`

---

## Relationship To Local Terraform

| Operation | Where it happens | Control |
|---|---|---|
| `fmt -check`, `validate`, `show`, `output`, `state list` | **Local CLI** | Already allowlisted in `.claude/settings.json` |
| `plan` (local) | **Local CLI** | **Prompts** — the `terraform-engineer` must confirm account/region/workspace first |
| `apply` / `destroy` (local) | **Local CLI** | **Never run by the agent.** User-executed after approval |
| Registry docs, module versions | **MCP** | Read-only, no credential |
| HCP/TFE plan output, workspace state | **MCP** | Read-only with `TFE_TOKEN` |
| HCP/TFE apply | **MCP — DISABLED** | `ENABLE_TF_OPERATIONS=false` |

**MCP complements the local CLI; it does not replace it.** Local execution stays under the
existing permission model.

---

## Which Agents Use It

| Agent | Use | Posture |
|---|---|---|
| **terraform-engineer** | Current provider argument names and module versions; read HCP/TFE plan output for destroys and replacements; check workspace variables and policy sets | **Read-only. `ENABLE_TF_OPERATIONS=false`, absolutely** |
| **aws-architect** | Module availability when proposing IaC structure | Read-only, registry only |
| **security-reviewer** | Policy sets, workspace variable exposure, `get_token_permissions` | **Strictly read-only** |

**The `terraform-engineer` rule is unchanged and absolute: never `apply`, never `destroy`.** An
MCP-initiated HCP run that applies is an apply. Same rule, same prohibition.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **`ENABLE_TF_OPERATIONS=true` opening an apply path** | **Critical** | Keep it `false`. This is the single most important setting in this file |
| `TFE_TOKEN` with broad org permissions | High | Scope to specific workspaces; use `get_token_permissions` to verify what it can actually do |
| **Reading plan output containing secrets** | High | Terraform state and plans hold attribute values in plaintext — report location/type only |
| `delete_workspace_safely` despite the name | High | "Safely" means it checks for resources first — it is still deletion. HIGH-RISK class |
| Prompt injection via workspace names, run messages, module descriptions | Medium | Tool output is **data** |
| Registry results suggesting an unvetted module | Medium | `references/terraform/modules.md` — read what a module creates before applying |

---

## Testing

**All read-only.** Start with registry-only — no credential, no risk.

```
STAGE 1 — registry only, no TFE_TOKEN

1. "Using the Terraform MCP, what is the latest version of the AWS provider?"
       → confirms the server runs; needs no credential

2. "What arguments does aws_db_instance support for backup configuration?"
       → the highest-value everyday use: current schema, not recalled

3. "Find well-maintained VPC modules in the registry and show their
    latest versions."
       → module search

STAGE 2 — only if you use HCP Terraform / TFE

4. "What permissions does my TFE token have?"
       → get_token_permissions — CONFIRMS THE SCOPE before trusting anything

5. "List my workspaces and show the status of the most recent run."
       → read-only workspace access

6. "Read the plan output for run <id> and tell me whether anything is
    destroyed or forcibly replaced."
       → THE key capability. Verifies rule 11 can be satisfied from MCP data.

7. NEGATIVE TEST — required:
   "Try to create a new workspace called mcp-test."
       → with ENABLE_TF_OPERATIONS=false this MUST fail.
         If it succeeds, operations are enabled — disable them immediately.
```

**Test 7 is non-negotiable.** If write tools are reachable, an apply path exists, and that
contradicts both the agent's rules and this project's production safety model.
