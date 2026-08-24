# claude-devops-architect

**A senior DevOps / AWS architect and mentor for [Claude Code](https://claude.com/claude-code) — with guardrails that actually stop destructive commands.**

Most agent configs are a pile of markdown that asks the model nicely. This one asks nicely *and* blocks `terraform destroy` at the harness level before it can run.

```bash
git clone https://github.com/hamzazulfiqar2/Devops-architect.git
node Devops-architect/bin/cli.js init ./my-project
```

---

## What it does

Turns Claude Code into a DevOps engineer that **won't let you skip the process** — and that explains its reasoning, because it's built for someone learning cloud infrastructure rather than someone who already knows it.

Ask it *"deploy this to AWS"* and it will not start writing Terraform. It runs discovery on your repo, derives infrastructure requirements, tells you which critical facts are missing (traffic, budget, RPO, region), and **stops to ask** — because a design built on invented numbers gets rebuilt.

Ask it *"should I use Kubernetes?"* and it compares EC2 vs ECS vs EKS vs Lambda in full, names the fixed monthly cost floor of each, and tells you plainly if you're a solo operator who doesn't need a $73/month control plane.

## Install

**Clone and run** — works everywhere, no npm quirks:

```bash
git clone https://github.com/hamzazulfiqar2/Devops-architect.git
node Devops-architect/bin/cli.js init ./my-project
```

**Or via npx from GitHub:**

```bash
# npm 11 and earlier
npx github:hamzazulfiqar2/Devops-architect init

# npm 12+ disabled git fetches by default — add the flag
npx --allow-git=all github:hamzazulfiqar2/Devops-architect init
```

> **Note:** npm 12 ships with `allow-git = "none"` as a *default*, so `npx github:…`
> fails with `EALLOWGIT` unless you pass `--allow-git=all`. Not a bug in this package —
> it affects every git-installed npm package. Check yours with `npm --version`.

**Useful flags:**

```bash
init ./my-project     # target a specific directory
init --dry-run        # preview, write nothing
init --force          # overwrite existing files
```

Then open the project in Claude Code and ask it to `analyze this project`.

Already have a `CLAUDE.md`? It won't be overwritten — you'll get `CLAUDE.devops-architect.md` to merge by hand. Re-running `init` is safe: it skips anything that already exists.

## Verify it works

```bash
npx claude-devops-architect doctor    # or: node bin/cli.js doctor
```

```
  ✓ CLAUDE.md present
  ✓ .claude/agents (4 files)
  ✓ .claude/skills (11 files)
  ✓ .claude/tools (1 files)
  ✓ settings.json valid — 158 allow rules
  ✓ safety hooks wired
  ✓ no mutating command allowlisted
  ✓ hook regression suite: 71/71 passed

  All checks passed. The agent is installed and its guardrails are live.
```

## How it reaches real systems

This is not a chatbot that only gives advice. It inspects and changes real infrastructure — through two paths, and **the first one works out of the box.**

**Path 1 — your local CLIs.** `gh`, `git`, `docker`, `kubectl`, `terraform`, `aws`, run through Claude Code's Bash tool and governed by a 158-rule read-only allowlist. Uses credentials you already have. No new software, no third party sees your data. **This is the default and usually enough.**

**Path 2 — MCP servers.** For what no CLI can do. Read-only by default, nothing enabled until you configure it. Start from `.mcp.json.example` — every server ships with its restrictive flags already set.

See what's actually usable on your machine:

```bash
npx claude-devops-architect tools
```

```
  ✓ GitHub      gh version 2.92.0        authenticated  github.com
  ✓ Docker      Docker version 28.1.1    —
  ✓ Terraform   Terraform v1.15.8        —
  ✓ AWS         aws-cli/2.36.29          NOT configured
  ✗ Helm        not installed

  Installed but not configured
    AWS: aws configure sso   then   aws sso login
```

It never pretends a tool exists. If `terraform` isn't installed, it says so and gives you the install command rather than guessing at output.

**Four permission levels**, mapped onto controls that are actually enforced:

| Level | What | Enforced by |
|---|---|---|
| **L0** Reasoning | Advice only, no external access | default |
| **L1** Read-only | Inspect repos, AWS, K8s, Terraform, logs, metrics | the allowlist — **runs without prompting** |
| **L2** Safe writes | Branch, PR, non-prod config, generate IaC | not allowlisted → **prompts** |
| **L3** Production / destructive | apply · delete · IAM · networking · secrets | **hooks — ASK or DENY** |

L3 can't be switched off by editing config. The hook doesn't consult the allowlist.

Full decision tree and per-system read/write/destructive matrix: [`.claude/tools/README.md`](.claude/tools/README.md).

## The safety model

This is the part that isn't just markdown.

**Blocked outright** — the hook denies these before execution:

`terraform destroy` · `terraform state rm/mv` · `kubectl delete` · `kubectl drain` · `docker system prune` · `docker volume rm` · `aws delete-*` · `terminate-*` · `purge-*` · `deregister-*` · `batch-delete-*` · `aws s3 rm/rb` · `kms schedule-key-deletion` · `rm -rf` on a root or home path

**Forced to prompt** — allowed *with* your approval, but never silently:

`terraform apply` · `kubectl apply/patch/scale/set image/rollout` · `helm install/upgrade` · IAM changes · security-group changes · `ecs update-service` · AWS `stop-*` / `reboot-*` / `modify-*` / `detach-*` · `git push --force` · secret rotation

**Also blocked:** any file write containing a credential-shaped literal — real AWS keys, GitHub PATs, private keys, hardcoded passwords.

**Denied outright:** `env`, `printenv`, `export -p`. These dump every environment variable into the transcript, credentials included — and `security.md` rule 2 has no exception process. A `deny` rule beats any allowlist, so this one can't be re-enabled by approving a prompt.

Why a hook rather than a permission rule? **Permission allowlists can be skipped in relaxed permission modes. A `PreToolUse` hook always runs.** It's the layer that survives someone broadening their config later.

The hooks fail *open* — a bug in them never breaks your session. They're a strong safety net, not an airtight boundary.

## What gets installed

```
CLAUDE.md              orchestration — routes requests to the right layer
.claude/
├── agents/            4 tool-restricted specialists
│                      (AWS architect · K8s engineer · Terraform engineer · security reviewer)
├── skills/            11 capability skills
├── workflows/         6 processes with approval gates
├── references/        33 factual reference files (AWS · K8s · Docker · Terraform · CI/CD)
├── rules/             security · production safety · architecture principles
├── templates/         architecture · deployment plan · CI/CD · readiness checklist
├── tools/             CLI-vs-MCP decision + per-system capability matrix
├── mcp/               MCP integration policy (read-only by default, nothing enabled)
├── hooks/             the safety hooks + their 71-case regression suite
└── settings.json      158 read-only command allowlist, zero mutating commands
decisions/             ADR log so approved decisions survive the session
.mcp.json.example      MCP wiring with restrictive defaults pre-set
```

**The subagents are genuinely restricted, not just instructed.** The Terraform engineer has no write tool — it *cannot* modify a file. The AWS architect has no Bash — it *cannot* run a command. That's enforced by the harness, not by prompt.

## How it thinks

Every substantial task follows one lifecycle, and the agent announces which phase it's in:

```
DISCOVER → ANALYZE → IDENTIFY GAPS → DESIGN → PLAN → VALIDATE
→ APPROVAL GATE → IMPLEMENT → VERIFY → DOCUMENT
```

Every tool-based operation follows a shorter one:

```
OBSERVE → PLAN → ACT → VERIFY
```

Never skip OBSERVE — a fix applied without inspecting current state is a guess. Never skip VERIFY — a command succeeding is not proof it worked.

Three rule files bind everything — 18 security rules, 18 production safety rules, 18 architecture principles. They cover the things that are expensive to learn the hard way:

- A committed secret is **compromised** — rotate it, deleting the file does nothing
- `# forces replacement` in a Terraform plan means your database gets destroyed
- Rollback does **not** undo database migrations
- An untested backup is a hypothesis
- NAT Gateway costs ~$32/month **each**, before a single byte moves

## Teaching mode

Built for learning. Ask *"what is a ClusterIP?"* or add `samjhao` / `Urdu mein` and you get:

> **Simple:** ClusterIP gives a service an internal-only address inside the cluster.
> **Urdu:** Yani cluster ke andar doosri applications is service ko access kar sakti hain, lekin bahar se koi nahi.
> **Example:** An office phone extension — works inside the building, not from outside.
> **Remember:** ClusterIP = internal only. Ingress/LoadBalancer = external.

## Honest limitations

- **Validated against one real repository so far.** It found a genuine architectural contradiction there (a WebSocket gateway with in-process state deployed to a 30-second serverless function) — but one project is one data point.
- **Hooks need Python** on your PATH. Without it they fail open and blocking is inactive. `doctor` tells you.
- **~18k tokens load every session** (`CLAUDE.md` + rules). That's a real cost on every message. Trim `.claude/rules/` if it matters to you.
- **No MCP server is enabled by default.** `.mcp.json.example` is scaffolding — you supply credentials and enable servers deliberately, one at a time. The CLI path works without any of it.
- **It only reaches what you've installed and authenticated.** No `aws` CLI and no AWS credentials means no AWS work, MCP or not. `tools` tells you where you stand.
- It is opinionated. It will tell you not to use Kubernetes. If you want a yes-man, this isn't it.

## Requirements

**Required:** Node >= 18 · Claude Code
**Strongly recommended:** Python (the safety hooks need it — without it, destructive-command blocking is inactive)
**Optional, per system you work with:** `gh` · `docker` · `kubectl` · `terraform` · `aws` · `helm`

Run `tools` to see what you have and what each unlocks.

## Contributing

Issues and PRs welcome — especially reports from running it against real projects, which is exactly what it needs most.

Run the guardrail suite before submitting:

```bash
python .claude/hooks/test_hooks.py    # 71 cases
node bin/cli.js doctor --self
```

## License

MIT
