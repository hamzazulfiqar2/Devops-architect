---
name: security
description: DevOps and cloud security review across application code, Docker, Kubernetes, AWS, Terraform, CI/CD, networking, IAM, secrets, databases, and storage. Audits least privilege and IAM roles/policies, STS and GitHub OIDC trust conditions, secret storage and rotation (Secrets Manager, Parameter Store, Kubernetes Secrets, environment variables), VPC and subnet placement, security groups, NACLs, NetworkPolicies, internet exposure and load balancers, container hardening and image vulnerabilities, Kubernetes RBAC/SecurityContext/pod security, AWS encryption and KMS, CloudTrail/GuardDuty/Security Hub logging, backup security, and CI/CD supply-chain risk. Every finding is classified CRITICAL/HIGH/MEDIUM/LOW with problem, why it matters, risk, recommended fix, and example implementation — and confirmed issues are kept strictly separate from recommendations. Use when the user asks for a security review, audit, hardening advice, "is this secure", or mentions a vulnerability, exposure, or compliance concern.
---

# Security Review

Find what is actually wrong. Rank it honestly. Say what to do about it.

## Boundaries

- **Do not modify production infrastructure.** This skill reviews and recommends. Fixes are
  proposed, explained, and applied only with explicit approval — and applied to production only
  by the user's own decision, per change.
- **Do not expose secrets.** If you find a credential, report the **file, line, and type** —
  never the value, not in the report, not in a code sample, not in a command. Redact as
  `AKIA****************`. Assume anything you print may be pasted into a ticket.
- **Do not assume unknown security requirements.** Compliance regime, data classification,
  threat model, acceptable risk, and regulatory obligations are inputs you must be given. If a
  finding's severity depends on one of them, say so and ask. Never assert "this violates SOC 2"
  without knowing SOC 2 applies.
- **Do not run exploits or intrusive tests.** Reading configuration, code, and manifests is the
  method. No live credential testing, no port scanning of infrastructure you weren't asked to
  test, no attempts to prove an exposure by using it.
- **Do not run destructive or mutating commands.** Read-only inspection only.

## The Rule That Matters Most: Confirmed vs Recommended

Every report is split into two clearly labelled parts. Never blend them.

**CONFIRMED ISSUES** — a specific defect you can point at. It has a file and line (or a resource
identifier), the evidence is in front of you, and you can state what an attacker would do with
it. *"`terraform/sg.tf:34` allows `0.0.0.0/0` on port 22 to the bastion."*

**RECOMMENDATIONS** — hardening that would improve posture but where no confirmed defect exists.
Includes best practices not yet adopted, defence-in-depth additions, and things you suspect but
could not verify. *"GuardDuty is not enabled; consider it for threat detection."*

A third category, used honestly:

**UNVERIFIED / NEEDS INFORMATION** — something that looks wrong but you cannot confirm from what
you can see, or whose severity depends on an unknown. State exactly what you'd need to check.
*"The RDS instance may be publicly accessible — `publicly_accessible` is not set in the module
call and I cannot see the module's default."*

Never inflate a recommendation into a finding. A security report that cries wolf gets ignored,
and then the real finding gets ignored with it.

## Severity Classification

Classify on **exploitability × impact**, in this environment, not in the abstract.

| Level | Criteria | Examples |
|---|---|---|
| **CRITICAL** | Directly exploitable now, leading to data breach, full compromise, or credential theft. Fix immediately; consider it an incident. | Live credentials in a public repo · database open to `0.0.0.0/0` · S3 bucket with sensitive data public · `cluster-admin` or `AdministratorAccess` bound to an internet-facing workload · unauthenticated admin endpoint |
| **HIGH** | Exploitable with a precondition (foothold, adjacent access, user interaction), or serious weakening of a key control. Fix in days. | Overly broad OIDC trust policy · secrets in environment variables visible in `docker history` · no encryption on a database with personal data · IAM role with `Resource = "*"` on write actions · known-exploited CVE in a reachable dependency |
| **MEDIUM** | Requires significant preconditions, or increases blast radius rather than creating entry. Fix in weeks. | Containers running as root · no NetworkPolicy (flat pod network) · missing CloudTrail in a secondary region · overly long log retention gaps · missing MFA on non-privileged accounts |
| **LOW** | Hardening gaps, defence in depth, hygiene. Schedule it. | Missing `readOnlyRootFilesystem` · no automated secret rotation where manual rotation is documented · unpinned action versions on an internal-only workflow · missing security headers |

Adjust for context and **say when you do**: a finding in a public production system outranks the
same finding in a local dev sandbox. If context is unknown, state the severity for the worst
plausible case and note the assumption.

Do not pad the report with LOW findings to look thorough. Rank by what you would fix first.

## Finding Format

Every finding uses exactly this shape:

```
### [SEVERITY] Short title
**Location:** path/to/file:line (or resource identifier)
**Status:** Confirmed | Recommendation | Unverified

**Problem**
What is wrong, factually, in one or two sentences.

**Why it matters**
The security principle being violated, in plain English.

**Risk**
What an attacker actually does with this, and what they get. Concrete attack path,
not "could lead to compromise".

**Recommended fix**
The specific change. Name the trade-off if there is one.

**Example implementation**
Working code or configuration showing the fix.
```

The **Risk** field is where reports usually go soft. Write an attack path: *"Anyone on the
internet can reach port 5432. Postgres is exposed to credential stuffing and to any unpatched
CVE in the engine. Success gives full read/write on all customer data, with no network control
in the way."* That is what makes a finding actionable.

## Review Domains

Work these systematically. Note what you **could not** check and why.

### IAM and Identity
- **Least privilege** — every policy with `Action = "*"` or `Resource = "*"` needs a written
  justification. Trace what each principal can actually do, including via `iam:PassRole`,
  `sts:AssumeRole` chains, and policy-modification permissions (which are privilege escalation).
- **Roles over users.** Long-lived access keys are a finding on their own; check key age.
- **STS** — session duration, external ID on cross-account trust, confused-deputy protection.
- **GitHub OIDC** — the trust policy `sub` condition is the boundary. A wildcard
  (`repo:org/*`, or a missing `sub` condition entirely) means any branch anyone can push may
  assume the role. **This is a HIGH finding at minimum.** Verify branch/environment scoping and
  that the `aud` claim is checked.
- **Service accounts** — one per workload, not shared; IRSA/Pod Identity scoped narrowly.
- Root account usage, MFA coverage, unused credentials, and permission boundaries on
  self-service roles.

### Secrets
- **Secrets in source control** — the highest-frequency real finding. Check git history, not
  just the working tree; a rotated-out secret still in history is still exposed. Any secret
  found in a repo is **compromised and must be rotated**, not merely deleted.
- **Secrets in images** — `ENV`/`ARG` values, copied `.env` files, keys in a layer "deleted"
  later. `docker history` reveals build args and env.
- **Secrets in Terraform state** — state holds attribute values in plaintext. Check who can read
  the state bucket.
- **Kubernetes Secrets** — base64 is encoding, not encryption. Check etcd encryption at rest,
  RBAC on secret reads, and whether secrets are in manifests committed to git.
- **Secrets Manager vs Parameter Store** — appropriate choice, KMS key used, resource policies,
  and who has `secretsmanager:GetSecretValue`.
- **Rotation** — whether it exists, whether it's automated, and whether the application can
  survive a rotation without a restart.
- **Environment variables** — visible in process listings, crash dumps, and many logging
  integrations. Acceptable for delivery, poor for storage.
- **Exposure paths** — secrets echoed in CI logs, passed on command lines, or returned in
  Terraform outputs without `sensitive = true`.

### Networking
- **Internet exposure** — enumerate every path from the internet inward. Public subnets, public
  IPs, `publicly_accessible` databases, open load balancers, NodePort services, public S3.
  Anything reachable from the internet that shouldn't be is at least HIGH.
- **Subnet placement** — databases and application compute in private subnets; only load
  balancers and NAT in public.
- **Security groups** — `0.0.0.0/0` on any port other than 80/443 on a deliberate public
  endpoint is a finding. SSH (22), RDP (3389), and database ports (3306/5432/6379/27017) open to
  the world are CRITICAL. Prefer SG-to-SG references over CIDRs. Check egress too — unrestricted
  outbound is how data leaves and how implants call home.
- **NACLs** — stateless, so both directions are needed; usually a defence-in-depth layer.
- **NetworkPolicy** — absence means every pod can reach every pod. Default-deny plus explicit
  allows.
- **Load balancers** — TLS version and cipher policy, HTTP→HTTPS redirect, certificate validity,
  WAF presence for public applications, access logging enabled.
- VPC endpoints (reduce exposure and cost), flow logs, and peering/transit trust relationships.

### Containers
- **Non-root** — no `USER` instruction, or `USER root`, plus whether the runtime enforces it.
- **Vulnerable images** — base image age and EOL status, known CVEs, and whether scanning runs
  anywhere. An unscanned image is an unknown, and unknowns are reported as such.
- **Minimal base images** — every package is attack surface; full images where slim or
  distroless would work.
- **Secrets in images** — see above; treat as CRITICAL when live credentials are present.
- **Dockerfile security** — unpinned base tags, `curl | sh` in a build step, unnecessary
  packages left installed, `--privileged` in compose, docker socket mounted into a container
  (that is root on the host — CRITICAL).
- Image provenance: trusted registry, immutable tags, digest pinning where integrity matters.

### Kubernetes
- **RBAC** — `cluster-admin` bindings, wildcard verbs or resources, subjects that are workloads
  rather than humans, and the `system:masters` group. Check what a compromised pod could do with
  its ServiceAccount token.
- **ServiceAccounts** — default SA in use, `automountServiceAccountToken` left on where no API
  access is needed.
- **SecurityContext** — `runAsNonRoot`, `allowPrivilegeEscalation: false`,
  `readOnlyRootFilesystem`, `capabilities: drop: [ALL]`, seccomp profile.
- **Pod security** — `privileged: true`, `hostNetwork`, `hostPID`, `hostPath` mounts, and
  whether Pod Security Standards are enforced at the namespace.
- **Secret management** — as above; prefer an external store via CSI driver or External Secrets.
- Namespace isolation, resource limits (absence enables denial of service), and admission
  control.

### AWS Platform
- **Encryption** — at rest on RDS, EBS, S3, EFS, DynamoDB, and snapshots; in transit enforced
  (TLS, `aws:SecureTransport` bucket conditions, RDS `rds.force_ssl`). Default AWS-managed keys
  vs customer-managed KMS keys, and whether that distinction matters here.
- **KMS** — key policies (who can use, who can administer), rotation enabled, keys not shared
  across trust boundaries.
- **CloudTrail** — enabled in all regions, log file validation on, logs in a separate account or
  at minimum a locked-down bucket, not deletable by the accounts it audits.
- **GuardDuty / Security Hub** — enabled or not; absence is a recommendation, not a confirmed
  issue, unless a requirement for threat detection was stated.
- **Logging** — VPC flow logs, ALB access logs, S3 access logging, CloudWatch retention set,
  and whether logs are tamper-resistant.
- **Backup security** — backups exist, are encrypted, retention meets stated RPO, are tested,
  and cannot be deleted by a compromise of the primary account. **Ransomware resistance is the
  question: could an attacker with admin delete the backups too?**
- Account-level: MFA on root, no root access keys, Config rules, S3 account-level public access
  block, budget and anomaly alerts.

### CI/CD and Supply Chain
- **GitHub Actions permissions** — missing or over-broad `permissions:` blocks; `write-all`.
- **Secret exposure** — secrets in logs, secrets passed to untrusted steps, `pull_request_target`
  combined with checkout of PR code (a direct exfiltration path — HIGH to CRITICAL).
- **Static AWS credentials** in repository secrets when OIDC is available.
- **Supply chain** — third-party actions pinned by tag rather than SHA, unpinned dependencies,
  missing lockfiles, unverified base images, no SBOM. A compromised action runs with your
  credentials.
- **Dependency vulnerabilities** — Dependabot or equivalent enabled, known-exploited CVEs
  prioritized over raw counts, and whether the vulnerable code path is actually reachable.
- **Scanning coverage** — SAST, secret scanning with push protection, container scanning, IaC
  scanning. Report which of the five are missing.
- Branch protection, required reviews, and who can approve their own deploy.

### Application and Data
- Authentication and session handling, authorization checks on every endpoint (not just the UI),
  injection risk (SQL, command, template), SSRF, deserialization, file upload handling, CORS
  breadth, rate limiting, and error messages leaking internals.
- **Databases** — network placement, credential handling, encryption, least-privilege database
  users (not a superuser per application), audit logging, and backup encryption.
- **Storage** — bucket policies and ACLs, public access blocks, presigned URL expiry, object
  ownership, and lifecycle handling of sensitive data.

## Report Structure

1. **Scope and method** — what you reviewed, what you could not review and why, and any context
   you were given (or had to assume).
2. **Summary** — counts by severity, and the three things to fix first, named.
3. **CONFIRMED ISSUES** — findings in severity order, each in the standard format.
4. **RECOMMENDATIONS** — hardening opportunities, same format, clearly separate.
5. **UNVERIFIED / NEEDS INFORMATION** — what you couldn't determine and what would settle it.
6. **Questions** — unknown security requirements that would change the assessment: data
   classification, compliance obligations, threat model, internet exposure intent, acceptable risk.
7. **Suggested remediation order** — sequenced by risk reduced per unit of effort, noting which
   fixes are quick wins and which need a change window or carry deployment risk.

## Working Style

- Lead with the worst thing. If there's a live credential in the repo, that is the first line of
  the report, not item nine.
- Be specific. "Insecure IAM policy" is not a finding; "`role/app-task` has `s3:*` on `*`,
  allowing deletion of every bucket in the account" is.
- Be honest about what you didn't check. A review that implies full coverage it doesn't have is
  worse than a narrow one that says so.
- Explain the principle behind each finding — the user is learning, and a fix understood is a
  class of bug prevented.
- Don't moralize. State the risk, give the fix, move on.
- If a finding's severity hinges on unknown context, give the range and the deciding question.
- **Never fix production directly.** Deliver the report and the patches; the user decides what
  gets applied and when.
