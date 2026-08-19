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
  ✓ settings.json valid — 155 allow rules
  ✓ safety hooks wired
  ✓ no mutating command allowlisted
  ✓ hook regression suite: 64/64 passed

  All checks passed. The agent is installed and its guardrails are live.
```

## The safety model

This is the part that isn't just markdown.

**Blocked outright** — the hook denies these before execution:

`terraform destroy` · `terraform state rm/mv` · `kubectl delete` · `kubectl drain` · `docker system prune` · `docker volume rm` · `aws delete-*` · `terminate-*` · `purge-*` · `deregister-*` · `batch-delete-*` · `aws s3 rm/rb` · `kms schedule-key-deletion` · `rm -rf` on a root or home path

**Forced to prompt** — allowed *with* your approval, but never silently:

`terraform apply` · `kubectl apply/patch/scale/rollout` · `helm install/upgrade` · IAM changes · security-group changes · `ecs update-service` · AWS `stop-*` / `reboot-*` / `modify-*` / `detach-*` · `git push --force` · secret rotation

**Also blocked:** any file write containing a credential-shaped literal — real AWS keys, GitHub PATs, private keys, hardcoded passwords.

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
├── references/        31 factual reference files (AWS · K8s · Docker · Terraform)
├── rules/             security · production safety · architecture principles
├── templates/         architecture · deployment plan · CI/CD · readiness checklist
├── mcp/               MCP integration policy (read-only by default, nothing enabled)
├── hooks/             the safety hooks + their 64-case regression suite
└── settings.json      155 read-only command allowlist, zero mutating commands
decisions/             ADR log so approved decisions survive the session
```

**The subagents are genuinely restricted, not just instructed.** The Terraform engineer has no write tool — it *cannot* modify a file. The AWS architect has no Bash — it *cannot* run a command. That's enforced by the harness, not by prompt.

## How it thinks

Every substantial task follows one lifecycle, and the agent announces which phase it's in:

```
DISCOVER → ANALYZE → IDENTIFY GAPS → DESIGN → PLAN → VALIDATE
→ APPROVAL GATE → IMPLEMENT → VERIFY → DOCUMENT
```

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
- **No MCP server is enabled.** The `mcp/` directory is policy and documentation. You configure servers deliberately.
- It is opinionated. It will tell you not to use Kubernetes. If you want a yes-man, this isn't it.

## Requirements

Node >= 18 · Claude Code · Python (optional, for the safety hooks)

## Contributing

Issues and PRs welcome — especially reports from running it against real projects, which is exactly what it needs most.

Run the guardrail suite before submitting:

```bash
python .claude/hooks/test_hooks.py    # 64 cases
node bin/cli.js doctor --self
```

## License

MIT
