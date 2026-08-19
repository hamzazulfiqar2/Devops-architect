# Rules — Security

**Mandatory security rules for the DevOps Architect Agent.**

These rules bind **every** skill, workflow, and recommendation. They are not advice and they are
not defaults to be weighed against convenience. Where a rule conflicts with something being
easier, faster, or cheaper, the rule wins unless the exception process below is followed.

Related: `security` skill (review method) · `.claude/rules/safety.md` if present ·
`CLAUDE.md` IMPORTANT SAFETY RULE.

---

## How These Rules Are Applied

**Proactively.** Do not wait to be asked for a security review. If a rule is at risk in something
you are designing, writing, or reviewing, say so at the moment it comes up.

**Retroactively.** If you notice an existing violation while doing unrelated work, report it. Do
not silently fix it, and do not silently ignore it.

**When violated by something already in the repo.** State it plainly, classify severity, and give
the fix. A pre-existing violation is still a violation — inheritance is not justification.

---

## The Exception Process

Some rules have legitimate exceptions. Handling them badly is worse than the exception itself.

When a recommendation would violate one of these rules:

1. **Say so explicitly.** Name the rule being violated. Do not bury it in a list of details.
2. **Explain the trade-off** — what is gained, what is given up, and the specific risk created.
3. **Describe the attack or failure it enables** — concretely. *"Anyone on the internet can reach
   port 5432; success gives full read/write on all customer data"* — not *"reduces security."*
4. **Offer the compliant alternative** and what it costs (money, time, complexity).
5. **Ask.** Do not proceed on your own judgement.
6. **If the user confirms**, implement it, document the exception in the deliverable, and record
   it as **the user's accepted risk** — not as your recommendation.

**Rules 1, 2, 3, and 18 have no exception process.** There is no legitimate reason to hardcode a
secret, log a credential, commit a secret, or disable a control to make a deploy easier.

---

## The Rules

### 1. Never hardcode secrets

No passwords, API keys, tokens, connection strings, private keys, or certificates as literals in
source code, Dockerfiles, Terraform, Kubernetes manifests, CI configuration, or documentation.

**In practice**
- Secrets live in AWS Secrets Manager or SSM Parameter Store `SecureString`
- Terraform creates the secret **container**; the **value** is set out of band
- Workloads read secrets **at runtime by ARN**
- `ENV` and `ARG` in a Dockerfile are visible in `docker history` — never secrets
- `random_password` writes to Terraform state; prefer `manage_master_user_password = true` for RDS
- Terraform state stores attributes in plaintext — this is *why* secrets must not flow through it

**No exceptions.** Not for a demo, not temporarily, not "I'll replace it before merge."

---

### 2. Never expose credentials in logs

Not in application logs, CI output, error messages, stack traces, Terraform output, shell history,
or anything you print to the user.

**In practice**
- Report a found secret by **file, line, and type** — never the value. Redact as `AKIA****************`
- Mark sensitive Terraform outputs `sensitive = true`
- Never pass secrets on a command line — visible in process listings and shell history
- Never `echo` a secret in a CI step, even to debug
- Verify the application does not log full request bodies containing credentials
- Assume anything you print may be pasted into a ticket, a chat, or a screenshot

**No exceptions.**

---

### 3. Never commit secrets to Git

**In practice**
- `.gitignore` must cover `.env*`, `*.tfstate*`, `*.tfvars` (except `*.tfvars.example`),
  `.terraform/`, `*.pem`, `*.key`
- Enable GitHub secret scanning **and push protection**
- Check **git history**, not just the working tree, when reviewing

**When a committed secret is found — this is the important part:**

> **The secret is compromised. Deleting the file does not undo it — git history retains it, and it
> may already be cloned, cached, or indexed.**
>
> Required actions, in order:
> 1. **Rotate the credential immediately.** This is the only action that actually helps
> 2. Remove it from the codebase
> 3. Consider whether history rewriting is warranted (it does not help if the repo was ever public)
> 4. Check access logs for use of the credential
>
> Report it as **CRITICAL** the moment it is found — first line of the report, not item nine.

**No exceptions.**

---

### 4. Follow least privilege

Every principal gets the narrowest permissions that let it do its job — and nothing more.

**In practice**
- `Action = "*"` or `Resource = "*"` requires a **written justification** in the code
- Scope resources to specific ARNs, including path prefixes for S3
- Watch for privilege escalation paths: `iam:PassRole`, `iam:CreatePolicyVersion`,
  `iam:AttachRolePolicy`, `sts:AssumeRole` chains — the ability to change permissions *is* full
  permission
- One role per workload; never a shared role across services
- Apply to database users too — an application does not need superuser
- Permission boundaries on self-service roles

**Exception process applies.** A genuinely broad permission (some administrative automation) is
documented with its justification, its scope limits, and what compensating controls exist.

---

### 5. Prefer IAM roles over static credentials

**In practice**
- EC2 → instance profile · ECS → task role · EKS → IRSA or Pod Identity · Lambda → execution role
- Local development → SSO / `aws sso login`, not a long-lived key in `~/.aws/credentials`
- Long-lived access keys are a finding on their own — check key age when reviewing
- If a static key is unavoidable, it gets: minimal permissions, a documented owner, a rotation
  schedule, and monitoring for use

**Exception process applies** for third-party integrations that genuinely cannot assume a role.

---

### 6. Prefer GitHub OIDC for AWS CI/CD

Short-lived, per-workflow credentials with no long-lived secret to leak.

**In practice**
```yaml
permissions:
  id-token: write
  contents: read
```
- **The trust policy `sub` condition is the security boundary**
- Scope to `repo:<owner>/<repo>:ref:refs/heads/<branch>` or
  `repo:<owner>/<repo>:environment:<env>`
- **A wildcard such as `repo:<owner>/*`, or a missing `sub` condition, lets any branch anyone can
  push assume the role.** This is a HIGH finding at minimum
- Verify the `aud` claim is checked
- Separate roles per environment; the production role assumable only from the gated production
  environment

**Exception process applies** only where OIDC is genuinely unsupported. State why.

---

### 7. Keep databases private unless public access is explicitly required

**In practice**
- Databases in private or isolated subnets, no public IP, `publicly_accessible = false`
- Access only from application security groups — **SG-to-SG references, not CIDR ranges**
- Administrative access via bastion, SSM Session Manager, or VPN — never a public database port
- Applies to caches, search clusters, and message brokers too
- A database port open to `0.0.0.0/0` is **CRITICAL**, not a warning

**Exception process applies**, and "it's easier for local development" is not a sufficient reason —
propose SSM port forwarding instead.

---

### 8. Minimize public network exposure

**In practice**
- Enumerate **every** path from the internet inward, and confirm each is intentional
- Only load balancers, CDN, and NAT belong in public subnets
- Compute in private subnets; egress via NAT or VPC endpoints
- Prefer VPC endpoints over internet routing for AWS service traffic — better security *and*
  lower cost
- Kubernetes: no NodePort exposure to the internet; ingress through a controlled load balancer
- **Check egress too** — unrestricted outbound is how data leaves and how implants call home
- Account-level S3 public access block on

**Exception process applies** per exposed path, individually.

---

### 9. Encrypt sensitive data

**In practice**
- At rest: RDS, EBS, S3, EFS, DynamoDB, ElastiCache, **and snapshots and backups**
- Encryption at rest is on by default in most services now — verify rather than assume
- Decide AWS-managed vs customer-managed KMS keys deliberately; say which and why
- KMS key policies control both *use* and *administration* — review both
- Key rotation enabled
- Application-level encryption for particularly sensitive fields where warranted

**Exception process applies** — but encryption at rest is nearly free, so an exception is rarely
defensible.

---

### 10. Use TLS for external communication

**In practice**
- HTTPS on every public endpoint; HTTP redirects to HTTPS
- Modern TLS version and cipher policy on load balancers
- Valid certificate covering **every** hostname in use, including apex and `www`
- Auto-renewal configured **and verified** — ACM renews only while DNS validation resolves, so
  **monitor expiry regardless**
- TLS in transit to databases (`rds.force_ssl`, `aws:SecureTransport` bucket conditions)
- Internal service-to-service traffic: TLS where it crosses a trust boundary
- Never disable certificate verification in application code — that is rule 18

**Exception process applies** for internal traffic inside a controlled network boundary.

---

### 11. Use security groups with least required access

**In practice**
- **Reference other security groups, not CIDR blocks**, wherever possible
- Every `0.0.0.0/0` rule carries a comment explaining why
- Ports 22, 3389, 3306, 5432, 6379, 27017 open to the internet are **CRITICAL**
- Prefer standalone rule resources over inline blocks — inline rules silently fight with anything
  managed elsewhere
- Define egress explicitly; do not rely on the default allow-all
- NACLs are stateless — both directions needed if used

**Exception process applies** per rule, with the justification recorded in the code.

---

### 12. Review Kubernetes RBAC

**In practice**
- No `cluster-admin` bound to a workload, ever
- No wildcard verbs or resources without justification
- Each workload gets its own ServiceAccount — never `default`
- `automountServiceAccountToken: false` where no API access is needed
- Ask: **what could a compromised pod do with its ServiceAccount token?**
- Namespaced Roles over ClusterRoles wherever the scope allows
- Check the `system:masters` group and cluster access entries

**Exception process applies** for genuinely cluster-scoped operators, scoped as narrowly as their
function permits.

---

### 13. Avoid privileged containers unless explicitly justified

**In practice**
- No `privileged: true`, `hostNetwork`, `hostPID`, `hostIPC`, or `hostPath` mounts
- `allowPrivilegeEscalation: false`
- `capabilities: drop: [ALL]`, adding back only what is provably needed
- **The Docker socket mounted into a container is root on the host — CRITICAL**
- Enforce Pod Security Standards (`restricted`) at the namespace level
- `readOnlyRootFilesystem: true` where the application allows it

**Exception process applies** — node agents and CNI plugins are legitimate cases. Application
workloads almost never are.

---

### 14. Prefer non-root containers

**In practice**
- A `USER` instruction in every Dockerfile; verify with `docker exec whoami`
- `runAsNonRoot: true` and an explicit `runAsUser` in Kubernetes
- Files the app writes need ownership set (`COPY --chown`)
- Listen on ports above 1024 so no privileged binding is needed
- Some platforms reject root containers outright — this is a portability issue as well as a
  security one

**Exception process applies** for images that genuinely cannot run unprivileged, with the reason
recorded.

---

### 15. Scan container images

**In practice**
- Scan in CI **before pushing to the registry**, so a vulnerable image never lands
- Enable ECR scan-on-push as a second net
- Fail the build on critical severity by policy; report the rest
- **Decide block-vs-report explicitly** — blocking on every transitive CVE stops all work
- Prefer minimal base images; every package is attack surface
- Rebuild and redeploy periodically — a base image with no code change still accumulates CVEs

**Exception process applies** to individual findings (unreachable code path, no fix available),
documented per CVE — never to disabling scanning.

---

### 16. Scan dependencies

**In practice**
- Dependabot or equivalent enabled
- `npm audit` / `pip-audit` / `govulncheck` in the pipeline
- Prioritize **known-exploited** vulnerabilities over raw counts
- Consider reachability — a CVE in an unused code path is lower priority than one on a hot path
- Lockfiles committed so builds are reproducible and scans mean something

**Exception process applies** per finding, documented.

---

### 17. Scan Infrastructure as Code

**In practice**
- `tfsec`, `checkov`, or `trivy config` in CI, on every PR touching infrastructure
- Catches open security groups, unencrypted storage, public buckets, and broad IAM **before the
  resources exist** — which is the cheapest possible moment
- Scan Kubernetes manifests and Dockerfiles too
- Suppressions are inline, with a written reason and, where possible, an owner

**Exception process applies** per rule suppression, never to disabling the scan.

---

### 18. Never bypass security controls to make deployment easier

**In practice, this rule forbids:**
- Opening a security group "temporarily" to get a deploy working
- Granting `AdministratorAccess` because scoping the policy is taking too long
- Disabling TLS verification to get past a certificate error
- Committing a credential to unblock a pipeline
- Turning off a scanner because it is failing the build
- Removing `prevent_destroy` to let an apply through
- Skipping the production approval gate under time pressure
- Disabling MFA, audit logging, or deletion protection for convenience

**When a control blocks you, the control is usually right.** Fix the underlying problem.

If a control is genuinely wrong — a false positive, a misconfigured rule — fix **the control**,
deliberately and with a record, rather than working around it.

**"Temporary" changes become permanent.** A security group opened during an incident is still open
six months later. If something must be relaxed to resolve an incident, it goes in the postmortem
with an owner and a date to revert.

**No exceptions.**

---

## Severity Reference

When reporting a violation, classify it:

| Level | Criteria | Examples from these rules |
|---|---|---|
| **CRITICAL** | Directly exploitable now → breach, data loss, or credential theft | Committed live credential · database open to `0.0.0.0/0` · public bucket with sensitive data · `cluster-admin` on an internet-facing workload · Docker socket mounted into a container |
| **HIGH** | Exploitable with a precondition, or a key control seriously weakened | Wildcard OIDC trust policy · secrets in image layers · unencrypted database holding personal data · `Resource = "*"` on write actions |
| **MEDIUM** | Requires significant preconditions, or widens blast radius | Root containers · no NetworkPolicy · missing CloudTrail in a region · long-lived access keys in low-privilege use |
| **LOW** | Hardening gap, defence in depth | Missing `readOnlyRootFilesystem` · no automated rotation where manual is documented · unpinned action versions on an internal workflow |

Adjust for context and **say when you do** — the same finding in a public production system
outranks it in a local sandbox. If context is unknown, state the severity for the worst plausible
case and name the assumption.

---

## Reporting Format

Every violation:

```
[SEVERITY] <Rule #N> — <short title>
Location: <file:line or resource>
Status:   Confirmed | Recommendation | Unverified

Problem — what is wrong, factually.
Risk    — the concrete attack path and what the attacker gets.
Fix     — the specific change.
Example — working code or configuration showing the fix.
```

**Keep confirmed issues strictly separate from recommendations.** A report that inflates hardening
suggestions into findings gets ignored — and the real finding gets ignored with it.

---

## Standing Constraints

- **Never expose secret values** — in reports, code samples, commands, or examples.
- **Never modify production to apply a security fix** without explicit approval. Report, propose,
  wait.
- **Never run exploits or intrusive tests.** Reading configuration and code is the method.
- **Never assume unknown security requirements.** Compliance regime, data classification, and
  threat model are inputs. If a severity depends on one you were not given, say so and ask.
- **Never claim compliance.** Do not assert something meets SOC 2, PCI DSS, HIPAA, or GDPR. State
  the technical facts and let a qualified assessor judge.
