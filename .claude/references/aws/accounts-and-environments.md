# AWS Accounts and Environment Strategy

How to divide AWS accounts, environments, and regions. Decided **before** anything is built —
changing it later means migrating resources.

---

## The Account Boundary

An AWS account is the **strongest isolation boundary AWS offers**. Nothing inside an account is
truly isolated from anything else in it — IAM mistakes, service limits, and blast radius all stop
at the account edge, not at a tag or a VPC.

| Model | Shape | Use when |
|---|---|---|
| **Single account** | Everything in one account, separated by tags and IAM | Learning, solo projects, no real production data yet |
| **Two accounts** | Non-production + production | The common sensible starting point once production exists |
| **Three+ accounts** | dev · staging · prod (+ shared services, logging, security) | Multiple environments with real users, or compliance pressure |
| **Full Organizations** | Management account + OUs + many accounts | Teams, compliance regimes, chargeback |

**Recommendation for a solo operator:** start with **two accounts** — one for dev/staging, one for
production. It costs nothing extra (accounts are free; you pay for resources) and prevents the
single most damaging class of mistake: destroying production while working on dev.

Three accounts for a side project is often more isolation than the situation warrants. Say so and
pick deliberately.

---

## AWS Organizations

**What it is:** a container for multiple AWS accounts with central billing, service control
policies, and consolidated management.

**Use when:** more than two accounts · you want SCPs as guardrails · consolidated billing across
accounts · centralized CloudTrail and Config.

**Key pieces**
- **Management account** — creates accounts, holds billing. **Run no workloads in it**
- **Organizational Units (OUs)** — group accounts to apply policy: `Production`, `NonProduction`
- **Service Control Policies (SCPs)** — a permission *ceiling*. They do not grant; they restrict.
  Useful guardrails: deny leaving the org, deny disabling CloudTrail, deny regions you do not use
- **Consolidated billing** — one bill, and volume discounts pool across accounts

**Common mistakes**
- Running workloads in the management account
- Writing SCPs that lock everyone out, including yourself
- Assuming an SCP grants permission — it never does; IAM still has to allow the action

---

## Environment Isolation

Whatever the account model, these are **non-negotiable**:

| Item | Requirement |
|---|---|
| Terraform state | Separate per environment, always |
| Credentials and roles | Separate per environment. A staging role must not reach production |
| Secrets | Separate values; production secrets invisible to non-production |
| Data | Production data does not appear in staging unless deliberately anonymized |
| Naming | Environment in every resource name and tag |

**Staging should resemble production in *shape*, not necessarily in *size*.** Same architecture,
same deploy path, same artifact — smaller instances, single-AZ, shorter retention. Every difference
is untested surface and belongs in the deployment plan.

**Non-production cost controls** — usually 30–50% of a bill for something used a third of the week:
- Stop or scale to zero outside working hours (a dev environment at 40h/week costs ~76% less)
- Single-AZ, no read replicas, no Multi-AZ
- Smaller instance classes
- Shorter log, backup, and snapshot retention
- One NAT Gateway, or none
- Shared load balancer across dev services

---

## Regions

**Choose deliberately. Never silently default to `us-east-1`.**

Decide on:
1. **Where users are** — latency is the usual driver
2. **Data residency** — legal requirement, not a preference
3. **Service availability** — new services land in `us-east-1` first; some never reach smaller regions
4. **Cost** — pricing varies materially between regions

**Things to know**
- `us-east-1` is special: it hosts global service control planes (IAM, Route 53, CloudFront,
  Organizations, billing). **ACM certificates for CloudFront must live in `us-east-1`** regardless
  of where your application runs — a constant source of confusion
- S3 bucket names are globally unique across all regions and all accounts
- Cross-region data transfer costs more than cross-AZ, which costs more than intra-AZ
- Most resources are region-scoped and do not appear in the console when you are looking at a
  different region — a common cause of "forgotten resources still billing"

**Multi-region** is an availability and latency decision, not a default. It multiplies cost,
complexity, and data-consistency problems. Requires a stated requirement (RTO that single-region
cannot meet, or a legal/latency need).

---

## Account Baseline

Set up once per account, before workloads:

| Item | Why |
|---|---|
| Root account: MFA on, no access keys, unused | Root can do anything, including delete the account |
| An admin IAM role assumed via SSO or MFA | Day-to-day work never uses root |
| CloudTrail enabled in all regions, log file validation on | The audit record you will want after an incident |
| S3 account-level public access block | Prevents the classic public-bucket incident |
| Budget alarm | The cheapest protection against a surprise bill |
| Cost anomaly detection | Free; catches runaway spend early |
| Cost allocation tags activated in billing | Tags do **not** appear in Cost Explorer until activated |
| Default region set consistently | Prevents resources created in a region you forget |
| Default EBS encryption enabled | Encryption by default, no per-resource decision |

---

## Common Mistakes

- **Everything in one account, discovering the problem the day production is destroyed by a
  dev-targeted command.**
- Running workloads in the Organizations management account.
- Resources created in a region nobody checks — still billing, invisible in the console.
- Assuming tags provide isolation. Tags are labels, not boundaries.
- Sharing an IAM role between environments, so a staging mistake reaches production.
- Copying production data into staging "temporarily", creating an unmanaged copy of sensitive data.
- Forgetting that free tier expires 12 months after account creation, with nothing changing on
  your side.
