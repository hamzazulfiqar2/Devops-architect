# AWS Networking

VPC, subnets, routing, gateways, and firewalls. **Networking decides what is reachable, what
costs money, and what breaks first.**

---

## VPC

**What it is:** a private, isolated network in AWS. Everything with a private IP lives inside one.

**Architecture notes**
- CIDR is chosen at creation and cannot shrink. `/16` (65k addresses) is the common default;
  smaller is fine and easier to peer later
- Plan for non-overlap with anything you may peer with — including your office/VPN and other VPCs
- One VPC per environment per region is the normal shape. More VPCs is more routing, not more safety
- DNS resolution and DNS hostnames should both be enabled

**Common mistakes**
- CIDR too small to add subnets later, or overlapping with a network you later need to peer
- Assuming a VPC provides security on its own — it provides *addressing*; security groups provide
  security

---

## Subnets

**What it is:** a slice of the VPC CIDR bound to **one Availability Zone**.

**The three tiers**

| Tier | Route to internet | Contains |
|---|---|---|
| **Public** | Route to Internet Gateway | Load balancers, NAT Gateways. **Nothing else** |
| **Private** | Route to NAT (outbound only) | Application compute — ECS tasks, EC2, Lambda in VPC |
| **Isolated** | No internet route at all | Databases, caches |

**Architecture notes**
- A subnet is AZ-bound. Multi-AZ means **at least one subnet per tier per AZ**
- Two AZs is the practical minimum for availability; three is common for quorum systems
- AWS reserves 5 IPs in every subnet (first four and last)
- `map_public_ip_on_launch` should be set deliberately, not inherited
- Fargate tasks and Lambda-in-VPC consume subnet IPs — a `/28` runs out faster than expected

**Common mistakes**
- Putting a database in a public subnet
- One subnet per tier, so the "multi-AZ" design is single-AZ in practice
- Subnets too small for autoscaling to expand into

---

## Route Tables

**What it is:** the rules deciding where traffic leaves a subnet.

- **Public route table:** `0.0.0.0/0` → Internet Gateway
- **Private route table:** `0.0.0.0/0` → NAT Gateway
- **Isolated route table:** local routes only

**Notes**
- A subnet is public **because of its route table**, not because of its name
- Local routes within the VPC CIDR always exist and cannot be removed
- One route table per AZ for private subnets, if you run one NAT per AZ — otherwise all AZs depend
  on one NAT and lose AZ independence

**Common mistake:** a "private" subnet whose route table points at the IGW. Check the route table,
not the label.

---

## Internet Gateway (IGW)

**What it is:** the VPC's door to the internet. Horizontally scaled, redundant, **free**.

- One per VPC. Costs nothing
- A resource needs *all three* to be internet-reachable: a public IP, a route to the IGW, and a
  security group allowing the traffic
- Egress-only Internet Gateway is the IPv6 equivalent of NAT (outbound only) and is also free

---

## NAT Gateway

**What it is:** lets resources in private subnets reach the internet outbound, while remaining
unreachable inbound.

> **This is the most common surprise bill in AWS.**
> ~$32/month **each**, plus ~$0.045 per GB processed. Three AZs = ~$97/month before a byte moves.
> Traffic to S3, ECR, DynamoDB, Secrets Manager, and CloudWatch Logs flows through it by default.

**Use when:** private compute needs outbound internet — package installs, third-party APIs, webhooks
out.

**Do not use when:** the only outbound traffic is to AWS services (use VPC endpoints instead), or
the workload genuinely needs no egress.

**Cost reduction, in order of value**
1. **VPC Gateway Endpoints for S3 and DynamoDB are free** — removes that traffic from NAT entirely.
   Close to a no-brainer
2. **Interface Endpoints** (~$7/mo each + data) for ECR, Secrets Manager, CloudWatch Logs — pay for
   themselves at moderate volume
3. **One NAT total** in dev/staging, accepting AZ-failure risk *there only*
4. For small workloads, ask whether private subnets with NAT are needed yet at all — and say
   clearly what that gives up

**Architecture notes**
- A NAT Gateway is AZ-bound. One per AZ for real HA; one total is a single point of failure across
  all AZs
- A NAT **instance** (EC2) is cheaper but is now your responsibility to patch, scale, and monitor
- Cross-AZ traffic to reach a NAT in another AZ costs data transfer on top

---

## Security Groups

**What it is:** a **stateful** virtual firewall attached to an ENI (instance, task, database).
Return traffic is automatically allowed.

**Rules**
- **Reference other security groups, not CIDR ranges**, wherever possible — `allow from
  sg-app` survives IP changes and documents intent
- Every `0.0.0.0/0` rule carries a comment explaining why
- Ports 22, 3389, 3306, 5432, 6379, 27017 open to the internet are **CRITICAL** findings
- Define egress explicitly; the default is allow-all outbound
- Default-deny: anything not allowed is denied. There are no deny rules

**Terraform note:** prefer standalone rule resources (`aws_vpc_security_group_ingress_rule`) over
inline `ingress` blocks — inline rules silently fight with anything managed elsewhere, and two
security groups referencing each other inline creates a dependency cycle.

**Common mistakes**
- CIDR-based rules that break when an IP changes, or that are far broader than intended
- Opening a port "temporarily" during an incident and never closing it
- Forgetting egress — unrestricted outbound is how data leaves and how implants call home

---

## Network ACLs (NACLs)

**What it is:** a **stateless** firewall at the subnet boundary. Evaluated in rule-number order.

**Use when:** you need a coarse deny at subnet level — blocking a specific IP range, or a
compliance requirement for defence in depth.

**Do not use as the primary control.** Security groups are the right tool; NACLs are a second layer.

**Notes**
- Stateless means **both directions must be allowed** — a common cause of mystifying one-way
  connectivity failures
- Ephemeral ports (1024–65535) must be allowed for return traffic
- Default NACL allows everything; a custom NACL denies everything until you add rules

---

## VPC Endpoints

**What it is:** private connectivity from your VPC to AWS services without traversing the internet.

| Type | Services | Cost |
|---|---|---|
| **Gateway endpoint** | S3, DynamoDB only | **Free** |
| **Interface endpoint** (PrivateLink) | Most other services | ~$7/mo each + data processing |

**Use when:** private subnets talk to AWS services — which is nearly always. Better security *and*
lower cost than routing through NAT.

**Notes**
- Gateway endpoints attach to route tables; interface endpoints create an ENI and a private DNS name
- ECR needs **two** interface endpoints (`ecr.api` and `ecr.dkr`) plus the **S3 gateway endpoint**
  for image layers — a very common "why can't my private task pull images" cause
- Endpoint policies can restrict what the endpoint may reach

---

## Data Transfer Costs

The cost nobody models until the bill arrives.

| Path | Cost |
|---|---|
| Inbound from internet | **Free** |
| Outbound to internet | Charged per GB — the expensive direction |
| **Cross-AZ, both directions** | Charged. Chatty services spread across AZs generate real cost |
| Cross-region | More expensive again |
| Within the same AZ, private IPs | Free |
| Through NAT Gateway | Processing charge **on top of** transfer |
| Via VPC endpoint | Cheaper than NAT for AWS-service traffic |

An unexplained "EC2-Other" line on a bill is usually NAT processing or cross-AZ transfer.

---

## Common Mistakes

- Database in a public subnet, or `publicly_accessible = true` on RDS
- Three NAT Gateways in a project with almost no traffic
- No VPC endpoints, so all AWS-service traffic pays NAT processing
- "Private" subnets with an IGW route
- Security groups using CIDRs where SG references would work
- One subnet per tier, making a "multi-AZ" design single-AZ
- Removing a security group rule and cutting your own access, with no alternative route in
- Changing DNS during a cutover without lowering TTL first
