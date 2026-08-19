# AWS IAM and Identity

Who can do what, to which resource, under which conditions. **IAM is the control that matters most
and is misconfigured most often.**

---

## The Core Model

| Concept | What it is |
|---|---|
| **Principal** | Who is acting — a user, role, or service |
| **Policy** | A JSON document allowing or denying actions on resources |
| **Role** | A set of permissions that can be *assumed* temporarily. No long-lived credentials |
| **Trust policy** | Attached to a role: **who may assume it**. This is the security boundary |
| **STS** | The service that issues temporary credentials when a role is assumed |

**Evaluation order:** explicit `Deny` always wins → then SCP ceiling → then permission boundary →
then an explicit `Allow` → otherwise implicit deny.

**Two policies matter per role, and people forget the second:**
1. The **permissions policy** — what the role can do
2. The **trust policy** — who can become the role

A perfect permissions policy on a role anyone can assume is not security.

---

## Users vs Roles

| | IAM user | IAM role |
|---|---|---|
| Credentials | Long-lived access key | Temporary, auto-rotating |
| Leak impact | Permanent until rotated | Expires in hours |
| Use for | Almost nothing now | Everything |

**Rule: roles, not users.** A long-lived access key is a finding on its own — check key age when
reviewing.

**How each compute service gets a role:**

| Service | Mechanism |
|---|---|
| EC2 | Instance profile |
| ECS | **Task role** (what your code uses) and **task execution role** (what pulls images and writes logs) — distinguish these |
| EKS | IRSA or EKS Pod Identity |
| Lambda | Execution role |
| Human access | IAM Identity Center (SSO), `aws sso login` — not a key in `~/.aws/credentials` |

---

## Policy Structure

```json
{
  "Effect": "Allow",
  "Action": ["s3:GetObject"],
  "Resource": ["arn:aws:s3:::<bucket>/<prefix>/*"],
  "Condition": {"StringEquals": {"aws:SourceVpce": "<vpce-id>"}}
}
```

**Least privilege in practice**
- `Action = "*"` or `Resource = "*"` requires a **written justification** in the code
- Scope to specific ARNs, including S3 path prefixes
- Some actions genuinely cannot be resource-scoped (`ecr:GetAuthorizationToken`,
  `ec2:DescribeInstances`) — split those into a separate statement rather than widening everything
- One role per workload. Never share a role across services
- Conditions are underused: `aws:SourceIp`, `aws:SourceVpce`, `aws:SecureTransport`,
  `aws:PrincipalTag`

**Policy types**
- **Identity-based** — attached to a role or user
- **Resource-based** — attached to the resource (S3 bucket policy, KMS key policy, SQS queue
  policy). **Cross-account access needs both sides to allow it**
- **Permission boundary** — a ceiling on what an identity policy can grant. Use on self-service roles
- **SCP** — an organization-level ceiling. Never grants

---

## Privilege Escalation Paths

**The ability to change permissions *is* full permissions.** Watch for:

- `iam:PassRole` — lets a principal hand a more-privileged role to a service it launches. Always
  scope it to specific roles
- `iam:CreatePolicyVersion` / `iam:SetDefaultPolicyVersion` — rewrite your own permissions
- `iam:AttachRolePolicy` / `iam:PutRolePolicy` — attach `AdministratorAccess` to yourself
- `iam:UpdateAssumeRolePolicy` — make a privileged role assumable by you
- `sts:AssumeRole` chains — role A assumes B assumes C
- `lambda:CreateFunction` + `iam:PassRole` — run arbitrary code as a privileged role

When reviewing, ask: *what could this principal do in two steps, not one?*

---

## STS

**What it is:** issues short-lived credentials for assumed roles.

- Default session duration 1 hour; max 12 hours for role assumption
- **External ID** — required for third-party cross-account access, to prevent the confused-deputy
  problem. Any vendor asking for a cross-account role without one is doing it wrong
- Session tags can carry attributes into permission conditions
- `aws sts get-caller-identity` — **the first command for any AccessDenied**, and before any
  production action

---

## GitHub OIDC — CI/CD Without Static Keys

**What it is:** GitHub Actions proves its identity to AWS with a short-lived signed token; AWS
returns temporary credentials. **There is no long-lived secret to leak.**

Two halves:

1. **In AWS** — an IAM OIDC identity provider for `token.actions.githubusercontent.com`, plus a
   role whose trust policy restricts which repository and branch/environment may assume it.
2. **In the workflow:**

```yaml
permissions:
  id-token: write      # required to request the token
  contents: read

- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::<account>:role/<role>
    aws-region: <region>
```

**The `sub` condition is the security boundary:**

| Scope | Condition value |
|---|---|
| A branch | `repo:<owner>/<repo>:ref:refs/heads/main` |
| An environment | `repo:<owner>/<repo>:environment:production` |
| **Dangerous** | `repo:<owner>/*` or no `sub` condition at all |

A wildcard means **any branch anyone can push may assume the role**. This is the most common OIDC
misconfiguration and a HIGH finding at minimum. Also verify the `aud` claim is checked.

**Separate roles per environment.** The production role should be assumable only from the
production GitHub Environment, which is itself gated by required reviewers.

---

## Account Hygiene

| Item | Requirement |
|---|---|
| Root account | MFA on, no access keys, never used for daily work |
| Human access | IAM Identity Center / SSO with MFA |
| Access key age | Check it. Old keys are a finding |
| Unused credentials | IAM credential report lists them — remove |
| Access Analyzer | Free; finds resources shared outside the account |
| CloudTrail | All regions, log file validation on |

---

## Common Mistakes

- **Wildcard OIDC trust policy** — any branch can deploy to production
- Attaching `AdministratorAccess` because scoping the policy was taking too long
- Long-lived access keys in CI when OIDC is available
- Confusing the ECS **task role** with the **task execution role** — a missing CloudWatch Logs
  permission on the execution role makes tasks fail *silently, with no logs to read*
- Forgetting that cross-account access needs **both** the identity policy and the resource policy
- Unscoped `iam:PassRole`
- Assuming an SCP grants permission — it only restricts
- Not checking for an explicit `Deny` when debugging AccessDenied — it always wins
- Reusing one role across multiple workloads, so a compromise of one reaches everything
