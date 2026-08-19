# AWS Messaging — SQS, SNS, EventBridge

Decoupling work from the request path. **Compare all three whenever async appears** — they solve
different problems and are frequently confused.

---

## Choosing Between Them

| | **SQS** | **SNS** | **EventBridge** |
|---|---|---|---|
| **Pattern** | Point-to-point queue | Pub/sub fan-out | Event router with rules |
| **Consumers** | One consumer per message | Many subscribers, all get it | Routed by content-based rules |
| **Delivery** | Pull (poll) | Push | Push |
| **Retries / DLQ** | Built in, mature | Limited | Built in |
| **Ordering** | FIFO queues available | FIFO topics available | No ordering guarantee |
| **Use for** | Work queues, buffering, retries | Notifications, fan-out to several targets | Decoupled event routing, schedules, SaaS events |

**Rules of thumb**
- **Work that must be done exactly once by one worker → SQS**
- **One event, several unrelated reactions → SNS**, or EventBridge if the routing has conditions
- **"When X happens, and it looks like Y, do Z" → EventBridge**
- **Scheduled jobs → EventBridge Scheduler**

The common combination is **SNS → several SQS queues**: fan-out with per-consumer retry and DLQ.

---

## SQS

**What it is:** a managed message queue. Producers send; consumers poll, process, and delete.

**Use when:** buffering work off the request path · smoothing traffic spikes · retrying failed work
· decoupling producers from consumers · anything where losing work is unacceptable.

**Do not use when:** you need multiple independent consumers of the same message (that is SNS or
EventBridge), or you need sub-millisecond latency.

**Architecture**
- **Standard** — at-least-once delivery, best-effort ordering, effectively unlimited throughput.
  **Consumers must be idempotent**, because duplicates will happen
- **FIFO** — exactly-once processing and strict ordering within a message group, lower throughput.
  Only when ordering genuinely matters
- **Visibility timeout** — how long a message is hidden after being received. **Must exceed your
  processing time**, or the message reappears and gets processed twice while the first attempt is
  still running. This is the single most common SQS bug
- **Dead-letter queue (DLQ)** — after N failed receives, the message moves here. Configure one on
  every queue; without it, poison messages retry forever
- Long polling (`WaitTimeSeconds: 20`) reduces cost and empty receives. Short polling is almost
  never right
- Max message size 256 KB — larger payloads go to S3 with a pointer in the message
- Retention: up to 14 days

**Monitoring**
- `ApproximateAgeOfOldestMessage` is often the **best single async health signal** — it rises when
  consumers cannot keep up
- **Any message in a DLQ is worth an alert.** It means work is being lost
- Queue depth for scaling decisions

**Security:** queue policy for cross-account access · encryption at rest (SQS-managed or KMS) ·
IAM scoped to the specific queue ARN.

**Cost:** per-request, very cheap. First million requests free monthly. Long polling reduces
request count materially.

**Common mistakes:** visibility timeout shorter than processing time · no DLQ · assuming standard
queues deliver exactly once · non-idempotent consumers · polling in a tight loop instead of long
polling.

---

## SNS

**What it is:** publish/subscribe. One message to a topic, delivered to every subscriber.

**Use when:** fan-out to several destinations · notifications to email, SMS, or Slack via a webhook
· alarm delivery from CloudWatch · fanning one event into multiple SQS queues.

**Do not use when:** you need retry semantics and a DLQ per consumer — subscribe SQS queues to the
topic instead, so each consumer gets its own retry behavior.

**Architecture**
- Subscribers: SQS, Lambda, HTTP/S endpoints, email, SMS, mobile push
- **SNS → SQS is the standard durable fan-out pattern.** SNS alone has limited retry; a queue in
  front of each consumer gives durability
- FIFO topics exist, and require FIFO queues as subscribers
- Message filtering lets subscribers receive only matching messages — reduces downstream cost
- No message persistence: if there is no subscriber, the message is gone

**Security:** topic policy controls who may publish and subscribe · encryption at rest ·
**confirm HTTP/S subscriptions carefully** — an unconfirmed or attacker-controlled endpoint is a
data leak.

**Cost:** per-request plus per-delivery. SMS is significantly more expensive than other protocols
and varies by country.

**Common mistakes:** using SNS where a queue was needed, then discovering there is no retry ·
subscribing an HTTP endpoint with no authentication · relying on ordering.

---

## EventBridge

**What it is:** an event bus that routes events to targets based on content-matching rules. Also
the modern scheduler.

**Use when:** routing events by content · reacting to AWS service events (an ECS task stopping, an
S3 upload, a CodePipeline failure) · scheduled execution · ingesting SaaS partner events ·
decoupling services without them knowing about each other.

**Do not use when:** a simple queue is all that is needed — EventBridge adds a routing layer with
its own debugging surface.

**Architecture**
- **Default bus** receives AWS service events automatically. **Custom buses** for your own domain
  events
- **Rules** match on event structure (source, detail-type, and any field in the payload) and route
  to targets: Lambda, ECS tasks, SQS, SNS, Step Functions, API destinations
- **Input transformers** reshape the event before it reaches the target
- **DLQ and retry policy per target** — configure both
- **Archive and replay** — genuinely useful for recovering from a consumer bug
- **Schema registry** for discovering event structure

**EventBridge Scheduler** (the newer, separate service) is the right choice for cron-style work:
one-time or recurring, timezone-aware, with built-in retries. Compare against:
- **ECS scheduled tasks** — when the job needs a full container
- **A container running its own scheduler** — simple, but the job dies if the container does
- **Kubernetes CronJob** — if a cluster already exists

**Cost:** per event published. AWS service events on the default bus are free. Very cheap for
typical volumes.

**Common mistakes:** no DLQ on a rule target, so failures vanish silently · rules matching more
broadly than intended · assuming ordering · using EventBridge for high-throughput streaming (that
is Kinesis) · forgetting that a scheduled rule runs in UTC unless a timezone is set.

---

## Cross-Cutting: Async Design

- **Consumers must be idempotent.** At-least-once delivery is the norm; design for duplicates
- **Every queue and every rule target gets a DLQ.** Work that fails silently is work that is lost
- **Alert on DLQ depth (any message) and on oldest-message age.** These are the two signals that
  tell you async processing is broken
- Backpressure: what happens when consumers cannot keep up? Queue depth grows — decide whether that
  is acceptable buffering or a scaling trigger
- Message payloads should carry an ID for tracing and deduplication
- Keep messages small; put large payloads in S3 and pass a reference
