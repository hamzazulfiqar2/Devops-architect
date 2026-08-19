# AWS Data Stores — RDS, DynamoDB, ElastiCache, S3, EBS, EFS

**Data is the part you cannot recreate.** Every decision here needs backups, encryption, and
deletion protection before it needs performance tuning.

---

## Choosing a Data Store

| Need | Choose | Because |
|---|---|---|
| Relational schema, joins, ad-hoc queries | **RDS** | SQL, transactions, familiar tooling |
| Known key-based access at extreme scale | **DynamoDB** | Single-digit ms, no capacity planning, $0 idle |
| Caching, sessions, rate limiting, queues | **ElastiCache Redis** | In-memory speed |
| Objects, uploads, backups, static assets | **S3** | Cheap, durable, effectively infinite |
| A disk attached to one instance | **EBS** | Block storage, single-attach |
| A filesystem shared by many instances | **EFS** | POSIX, multi-attach — but expensive |

**Decide on the access patterns found in discovery, not on preference.** If the application writes
SQL with joins, DynamoDB is a rewrite, not a swap.

---

## RDS

**What it is:** managed relational database — PostgreSQL, MySQL, MariaDB, Oracle, SQL Server.

**Use when:** relational data, transactions, joins, or an existing SQL application.

**Do not use when:** access is purely key-value at massive scale (DynamoDB) or the data is really
objects (S3).

**Architecture**
- **Multi-AZ** = a synchronous standby in another AZ with automatic failover. Roughly **doubles
  cost**. Required for production availability targets; usually unnecessary in dev
- **Read replicas** are for read scaling, not HA. Asynchronous — replica lag is real
- **Connection limits** scale with instance size. Exhaustion is the classic serverless failure:
  each Lambda concurrent execution opens its own connection. Use **RDS Proxy** or prefer DynamoDB
- Storage autoscaling avoids over-provisioning upfront. `gp3` over `gp2` — ~20% cheaper with better
  baseline performance
- **Many attribute changes force replacement.** Always check the Terraform plan
- Aurora: better performance and failover, more expensive, more AWS-specific. Aurora Serverless v2
  scales down but has a floor — price it before assuming it is cheaper

**Security:** private/isolated subnet · `publicly_accessible = false` · encrypted at rest ·
`rds.force_ssl` for TLS in transit · **`manage_master_user_password = true`** so the password lives
in Secrets Manager and never enters Terraform state · least-privilege database user, not superuser
· access only from application security groups (SG-to-SG).

**Protection — set before the first apply**
- `deletion_protection = true`
- `prevent_destroy` in Terraform
- `skip_final_snapshot = false`
- Automated backups on, retention meeting the stated RPO
- **A restore actually tested** — an untested backup is a hypothesis

**Cost:** usually a top-three line item. Levers: right-size from real CPU and connection metrics ·
Reserved Instances for steady production · Graviton instance classes · **remove Multi-AZ in
non-production** · stop dev instances outside working hours (RDS auto-restarts after 7 days, so
pair with automation) · delete accumulated manual snapshots.

**Common mistakes:** publicly accessible · no connection pooling · Multi-AZ in dev (pure waste) ·
`gp2` when `gp3` is cheaper and faster · migrations tested only against 100 rows · assuming a
replica is a backup.

---

## DynamoDB

**What it is:** managed key-value and document store. Single-digit millisecond latency at any scale.

**Use when:** access patterns are known and key-based · very high or very spiky scale · you want
$0 at idle · session stores, event stores, lookup tables.

**Do not use when:** you need joins, ad-hoc queries, or reporting. **Name the lock-in:** access
patterns become schema, and changing them later is a data migration.

**Architecture**
- Design the table around the queries. Partition key choice decides everything; a hot partition
  throttles regardless of provisioned capacity
- **GSIs duplicate writes** — each index costs write capacity. Unused GSIs are pure waste
- **Capacity mode is the dominant cost decision:** **on-demand** for unpredictable or low traffic;
  **provisioned with autoscaling** is substantially cheaper for steady predictable load. Switching
  mode is a real lever
- **TTL** for ephemeral items — free deletion instead of paying to scan and delete
- Point-in-time recovery: 35 days, enable on anything real
- DynamoDB Streams for change capture into Lambda

**Cost:** $0 idle on-demand. Watch for: unused GSIs · items larger than necessary · **scans where
queries would do** · PITR left on for scratch tables.

**Common mistakes:** modelling it like a relational table · a partition key with low cardinality ·
scanning in production code · discovering a needed access pattern after the schema is set.

---

## ElastiCache

**What it is:** managed Redis or Memcached.

**Use when:** a caching requirement was actually identified — expensive queries, session storage,
rate limiting, leaderboards, distributed locks.

**Do not use when:** nobody has measured that caching is needed. Adding a cache adds a component,
a failure mode, and an invalidation problem.

**Notes:** Redis over Memcached for almost everything (persistence, replication, data structures)
· cluster mode for sharding beyond one node's memory · **treat cache data as disposable** — the
application must work, slower, when the cache is empty · private subnets, encryption in transit and
at rest, AUTH enabled · **ElastiCache Serverless** removes capacity planning at a price premium.

**Common mistakes:** the application breaking when the cache is cold · caching without an
invalidation strategy · using a cache as a database.

---

## S3

**What it is:** object storage. Effectively infinite, extremely durable, cheap.

**Use when:** uploads, static assets, backups, logs, build artifacts, data lakes — almost any file
that is not a running database.

**Do not use when:** you need a POSIX filesystem or low-latency random writes.

**Architecture**
- **Bucket names are globally unique** across all AWS accounts — suffix with account ID or a
  random string
- Storage classes: Standard → Standard-IA (30+ days) → Glacier Instant/Flexible → Deep Archive.
  **Intelligent-Tiering** is the low-effort choice when access patterns are unknown
- **Check retrieval cost and minimum storage duration** before recommending a colder class —
  moving frequently-read data to Glacier can *increase* total cost
- **Presigned URLs** for uploads and downloads — never proxy large files through your compute
- Versioning protects against accidental deletion and overwrite. Pair it with a lifecycle rule or
  old versions accumulate invisibly
- Serve public content via **CloudFront with OAC**, keeping the bucket private

**Security:** account-level public access block on · bucket policies over ACLs (disable ACLs with
Object Ownership) · encryption at rest (SSE-S3 default, SSE-KMS when you need key control and
audit) · `aws:SecureTransport` condition to require TLS · access logging.

> **Reading a KMS-encrypted object needs `kms:Decrypt` in addition to `s3:GetObject`.** A very
> common cause of confusing AccessDenied errors.

**Cost traps:** no lifecycle policies (the default failure) · old versions accumulating under
versioning — billed but invisible in the object list · **incomplete multipart uploads billing
forever** (one lifecycle rule fixes it) · everything sitting in Standard.

**Common mistakes:** accidentally public buckets · versioning without lifecycle · proxying uploads
through the application instead of presigned URLs · assuming `s3:GetObject` is enough for encrypted
objects.

---

## EBS

**What it is:** block storage attached to one EC2 instance. A virtual disk.

**Notes**
- `gp3` is the default — cheaper than `gp2` with independently configurable IOPS and throughput.
  Migrating `gp2` → `gp3` is near-free and saves ~20%
- `io2` only when you have measured a genuine IOPS requirement
- AZ-bound; it cannot attach to an instance in another AZ
- Snapshots are incremental but **never expire on their own** — use Data Lifecycle Manager
- Encryption at rest should be on by default at the account level

**The most common pure waste in AWS: unattached volumes.** They bill in full, forever, and nothing
alerts you.

---

## EFS

**What it is:** managed NFS. A filesystem many instances can mount simultaneously.

**Use when:** you genuinely need shared `ReadWriteMany` POSIX access — legacy applications, shared
uploads across instances, some CI workloads.

**Do not use when:** a single writer would do (EBS is far cheaper) or the data is really objects
(S3 is far cheaper). **EFS is significantly more expensive per GB than either.**

**Notes:** enable Infrequent Access lifecycle · mount targets needed in each AZ · performance modes
matter for metadata-heavy workloads · it is the only option when a container platform needs
`ReadWriteMany`.

---

## Cross-Cutting: Protecting Data

Applies to every store above.

| Control | Requirement |
|---|---|
| Encryption at rest | On. Nearly free — an exception is rarely defensible |
| Encryption in transit | Enforced, not just available |
| Deletion protection | On for anything in production |
| `prevent_destroy` | In Terraform, on every data store |
| Backups | Automated, frequency meeting the stated RPO, encrypted |
| Backup isolation | **Stored where a compromise of the primary account cannot delete them** |
| **Restore tested** | Actually performed, with a date |
| Retention | Defined deliberately; never trimmed to save money |

**Backups are never a cost-optimization target.** An outage costs more than a year of the storage
that would have prevented it.
