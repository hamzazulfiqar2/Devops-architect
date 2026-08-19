# AWS Edge and DNS — ALB, NLB, API Gateway, Route 53, CloudFront, ACM

How traffic reaches the application, and how it is named and secured in transit.

---

## Choosing the Public Entry Point

| Option | Fixed cost | Gives you | Choose when |
|---|---|---|---|
| **ALB** | ~$16–22/mo + LCUs | Host/path routing, TLS termination, health checks, WAF | HTTP services, multiple targets or paths |
| **NLB** | ~$16/mo + LCUs | Raw TCP/UDP, static IPs, very low latency | Non-HTTP protocols, static IP requirement, extreme throughput |
| **API Gateway** | $0 idle, per request | Auth, throttling, usage plans, request validation | APIs needing those features, or Lambda-backed with low volume |
| **Lambda Function URL** | $0 | A direct HTTPS endpoint | Single Lambda, simplest possible |
| **CloudFront** | $0 idle, per request + transfer | Caching, global edge, cheaper egress | Static content, global audience, or fronting an origin |

**Note:** at low volume, API Gateway or a Function URL can be cheaper than an idle ALB, because
the ALB bills whether or not anyone visits.

---

## Application Load Balancer (ALB)

**What it is:** layer-7 load balancer. Routes HTTP/HTTPS by host, path, header, or method.

**Use when:** HTTP services with multiple targets, path-based routing, or TLS termination needed.

**Do not use when:** you need raw TCP (use NLB), a static IP (use NLB), or the traffic is a single
low-volume Lambda (use a Function URL).

**Architecture**
- Lives in **public subnets across at least two AZs**; targets live in private subnets
- **Target groups** hold targets and own the health check. `describe-target-health` is the first
  command when something is unreachable
- Health check should verify **serving capability**, not just that the port is open
- Deregistration delay (connection draining) — default 300s, often worth lowering for faster deploys
- Idle timeout default 60s — must exceed your slowest legitimate response, or you get 504s
- One ALB can front many services via host/path rules. **Consolidating is the cost argument**
  against one ALB per service

**Status codes and what they mean**

| Code | Meaning |
|---|---|
| **502** | Target returned something invalid or closed the connection — usually the app crashed or the port is wrong |
| **503** | No healthy targets — check target health first |
| **504** | Target timed out — app too slow, or idle timeout shorter than the response |

`ELB_*` metrics mean the load balancer generated the error; `Target_*` means your app did. That
split tells you which side to investigate.

**Security:** HTTPS listener with an ACM certificate · HTTP redirects to HTTPS · modern TLS policy
· WAF for genuinely exposed applications · access logs to S3 · deletion protection in production.

**Common mistakes:** one ALB per service when path routing would do · ALBs left running behind
deleted services · health check path that returns 200 while the app cannot serve · idle timeout
shorter than a long request.

---

## Network Load Balancer (NLB)

**What it is:** layer-4 load balancer. TCP/UDP, extremely fast, static IP per AZ.

**Use when:** non-HTTP protocols · a static IP or PrivateLink endpoint is required · very high
throughput with minimal latency · TLS passthrough to the application.

**Do not use when:** you want path or host routing, or HTTP-aware features — that is ALB.

**Notes:** preserves the client source IP by default (which changes how security groups must be
written) · health checks are TCP or HTTP · no WAF integration.

---

## API Gateway

**What it is:** a managed API front door with auth, throttling, validation, and usage plans.

**HTTP API** — cheaper, faster, fewer features. The default choice.
**REST API** — more features (request validation, API keys, usage plans, WAF, private endpoints).

**Use when:** you need built-in authorization (JWT, Cognito, Lambda authorizer), rate limiting per
client, request validation, or a Lambda-backed API at low-to-moderate volume.

**Do not use when:** sustained very high volume where per-request pricing exceeds an ALB, or you
need long-lived connections beyond its limits.

**Notes:** 29-second integration timeout on REST APIs — long operations must be async · throttling
defaults exist and will surprise you under load · stages map to environments.

---

## Route 53

**What it is:** DNS. Also health checks and routing policies.

**Architecture**
- **Hosted zone** ~$0.50/mo, plus per-query charges. Queries are cheap
- **ALIAS records** are Route 53-specific: they point at AWS resources (ALB, CloudFront, S3) and —
  unlike CNAME — **work at the zone apex** and cost nothing to resolve. Use ALIAS for AWS targets
- **A CNAME cannot exist at the apex.** This is the most common DNS mistake
- Routing policies: simple · weighted (canary, blue/green) · latency · failover · geolocation
- Health checks can drive DNS failover, but DNS failover is slow — it depends on TTL and resolver
  caching. Not a substitute for a load balancer

**TTL discipline**
- **Lower TTLs before a cutover, not during.** A 300s TTL means up to five minutes of clients still
  hitting the old target after you change the record
- Raise them back afterwards to reduce query cost and latency

**Common mistakes:** registrar nameservers not matching the hosted zone (the zone is authoritative
for nothing until they do) · CNAME at the apex · changing a record without lowering TTL first ·
letting domain registration lapse · creating a second hosted zone for the same domain and wondering
why changes have no effect.

---

## CloudFront

**What it is:** a CDN. Caches content at edge locations worldwide and terminates TLS close to users.

**Use when:** static assets · a global audience · you want cheaper egress (CloudFront egress is
cheaper than direct S3/EC2 egress) · you need WAF or DDoS protection at the edge · serving a
private S3 bucket publicly via OAC.

**Do not use when:** purely dynamic, uncacheable content for a single-region audience — you add
latency and cost with no benefit. **Say when it is genuinely unnecessary.**

**Architecture**
- **Origin Access Control (OAC)** lets CloudFront read a private S3 bucket — the bucket stays
  blocked from public access. This is the correct way to serve S3 content
- Cache behaviors per path pattern; TTLs and cache keys decide hit ratio
- **Check cache hit ratio** — a low ratio means paying for CloudFront without the benefit
- Invalidations cost money beyond a free tier. Prefer versioned/hashed asset filenames over
  invalidating
- Price classes limit which edge locations are used — match your actual audience geography
- Distribution changes take time to deploy globally

**The certificate trap:** **ACM certificates for CloudFront must be in `us-east-1`**, regardless of
where the rest of your infrastructure lives.

**Cache headers that matter:** long `max-age` + `immutable` for hashed assets; short or `no-cache`
for `index.html`. Getting this backwards either serves stale apps or defeats caching entirely.

---

## ACM (AWS Certificate Manager)

**What it is:** free public TLS certificates, with automatic renewal.

**Notes**
- Free for use with ALB, NLB, CloudFront, API Gateway. **Cannot be exported** — you cannot install
  an ACM public certificate on an EC2 instance directly
- **DNS validation** is the right choice — it renews automatically as long as the validation CNAME
  stays in place. Email validation requires manual action every renewal
- **Auto-renewal only works while DNS validation still resolves.** If the zone is deleted, the
  record removed, or the domain moves, renewal silently fails
- **Monitor `DaysToExpiry` regardless of auto-renewal.** Certificate expiry is a complete outage
  and is trivially preventable
- The certificate must cover **every** hostname in use — apex *and* `www`, plus any subdomain. A
  wildcard (`*.example.com`) does **not** cover the apex

**Common mistakes:** certificate in the wrong region for CloudFront · validation CNAME deleted
after issuance, so renewal fails a year later · certificate missing the apex or `www` · assuming
auto-renewal means no monitoring is needed.
