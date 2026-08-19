# Kubernetes — Networking

---

## The Model

- Every pod gets its own IP. On EKS with the VPC CNI, that is a **real VPC IP** — so pods count
  against subnet capacity
- **All pods can reach all pods by default**, across namespaces, unless a NetworkPolicy says
  otherwise
- Pod IPs change constantly. **Services exist to give a stable name and IP in front of a changing
  set of pods**
- Services find their pods **by label selector** — this is the connection point that most often
  breaks

---

## Service

**What it is:** a stable name, virtual IP, and load-balancing endpoint for a set of pods.

| Type | Reachable from | Use when |
|---|---|---|
| **ClusterIP** | Inside the cluster only | The default. Internal service-to-service |
| **NodePort** | A high port (30000–32767) on every node | Rarely used directly; mostly a building block for LoadBalancer |
| **LoadBalancer** | The internet, via a cloud load balancer | External access — **but provisions one cloud LB per Service, which is costly if repeated** |
| **ExternalName** | Maps a name to an external DNS record | Pointing at a managed database without hardcoding hostnames |

**Key fields**
- `selector` — the labels identifying target pods. **Wrong selector = Service routes to nothing**
- `port` — the port the Service listens on
- `targetPort` — the port on the **container**. A mismatch here is the second most common
  connectivity bug
- Headless Service (`clusterIP: None`) — no virtual IP; DNS returns pod IPs directly. Required for
  StatefulSets

**The first diagnostic:**
```
kubectl get endpoints <service>
```
**Empty endpoints means the selector matches no *ready* pods** — either the labels do not match, or
no pod is passing its readiness probe. This one command settles most "my service returns nothing"
problems.

---

## Ingress

**What it is:** HTTP/HTTPS routing rules by host and path, in front of many Services, with TLS
termination.

**Use instead of** a LoadBalancer Service per application — consolidating onto one load balancer is
the cost argument.

> **An Ingress object is only a set of rules. It does nothing unless an Ingress Controller is
> running to enforce them.** An Ingress with no controller silently does nothing — a genuinely
> confusing first-time failure.

**Ingress Controllers**
| Controller | Notes |
|---|---|
| **AWS Load Balancer Controller** | Provisions a real ALB. The natural choice on EKS |
| **NGINX Ingress** | Portable, feature-rich, runs in-cluster behind an NLB |
| **Traefik** | Portable, good developer experience |

**Notes:** `ingressClassName` selects which controller handles the rule · the TLS secret must live
**in the same namespace** as the Ingress · annotations carry controller-specific configuration and
are not portable between controllers · **Gateway API** is the successor to Ingress and worth
mentioning for new clusters, though Ingress remains dominant.

**Debug order when an Ingress does not work:** is a controller running? → does `ingressClassName`
match it? → is the backend Service correct and does it have endpoints? → does the TLS secret exist
in this namespace? → does DNS point at the load balancer? → **read the controller's logs**, which
usually state the problem outright.

---

## Cluster DNS

Every Service gets a DNS name:

```
<service>.<namespace>.svc.cluster.local
```

- Within the same namespace, the short name `<service>` works
- Cross-namespace requires `<service>.<namespace>`
- Headless Services resolve to individual pod IPs
- StatefulSet pods get stable per-pod DNS: `<pod>.<service>.<namespace>.svc.cluster.local`

**Test from inside a pod, not from your laptop:**
```
kubectl exec -it <pod> -- nslookup <service>.<namespace>
```

**Common DNS failures:** wrong name form (using the short name across namespaces) · CoreDNS pods
unhealthy or resource-starved · **a NetworkPolicy blocking egress to kube-dns** — a subtle one that
breaks all name resolution in a namespace · a `dnsPolicy` override on the pod.

---

## NetworkPolicy

**What it is:** a firewall for pods. Selects pods by label and defines allowed ingress and egress.

> **Without any NetworkPolicy, every pod can reach every other pod in the cluster.** A compromised
> frontend pod can talk directly to your database pod.

**Approach**
1. Apply a **default-deny ingress** policy per namespace
2. Add explicit allow rules for the traffic that should exist
3. **Remember egress to kube-dns** if you also default-deny egress, or DNS breaks

**Requires a CNI that enforces policies.** The AWS VPC CNI needs network policy support enabled;
Calico and Cilium enforce them natively. **Verify enforcement before promising isolation** — an
unenforced NetworkPolicy looks correct and does nothing.

**Policies are additive** — there is no deny rule. Anything not allowed by some policy, once a
policy selects the pod, is denied.

---

## Common Networking Mistakes

| Mistake | Symptom |
|---|---|
| Label/selector mismatch | Service has no endpoints; requests time out |
| `targetPort` ≠ container port | Connection refused through the Service |
| App bound to `127.0.0.1` instead of `0.0.0.0` | Works inside the container, unreachable from outside |
| Using `localhost` to reach another service | `localhost` inside a pod means *that pod* |
| Short DNS name across namespaces | NXDOMAIN |
| Ingress with no controller | Nothing happens, no error |
| TLS secret in the wrong namespace | Certificate not found; Ingress serves default cert |
| Default-deny egress without a kube-dns exception | All name resolution fails |
| LoadBalancer Service per application | One cloud load balancer each — unnecessary cost |
| NodePort exposed to the internet | Bypasses the controlled ingress path |
