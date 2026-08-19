# Kubernetes — Configuration and Storage

---

## Labels and Selectors

**What they are:** labels are key/value stickers on objects; selectors are queries that find objects
by their stickers. **This pairing is how nearly everything in Kubernetes connects.**

- A Service finds its pods by selector
- A Deployment owns its pods by selector
- A NetworkPolicy selects which pods it governs
- A PodDisruptionBudget selects which pods it protects

**Conventions** — use the standard set so tooling and dashboards understand your objects:
```yaml
app.kubernetes.io/name: <app>
app.kubernetes.io/instance: <release>
app.kubernetes.io/version: <version>
app.kubernetes.io/component: <api|worker|db>
app.kubernetes.io/managed-by: <helm|kustomize|terraform>
```

**Notes:** a Deployment's `selector` is **immutable after creation** — changing it requires
recreating the Deployment · **annotations** are for non-identifying metadata (checksums, controller
config) and cannot be selected on.

**The single most common Kubernetes bug: a label/selector mismatch.** The Service is created, looks
correct, and routes to nothing. `kubectl get endpoints <service>` reveals it instantly.

---

## ConfigMap

**What it is:** non-sensitive configuration, delivered as environment variables or mounted files.

**Two delivery modes, and the difference matters:**

| Mode | Live updates? |
|---|---|
| Mounted as a **volume** | **Yes** — the file updates in place (with a delay) |
| Injected as **environment variables** | **No** — requires a pod restart |

**Pods do not reload on their own.** Changing a ConfigMap consumed as env vars leaves pods running
the old config indefinitely, with no error and no signal. The standard fix is a **checksum
annotation** on the pod template, so a config change alters the template and triggers a rollout:

```yaml
annotations:
  checksum/config: <hash of the configmap>
```

**Notes:** 1 MB size limit · must be in the same namespace as the pod · `envFrom` injects every key
at once, which is convenient and makes it easy to lose track of what is set.

---

## Secret

**What it is:** the same mechanism as ConfigMap, for sensitive values.

> **`Secret` is base64-*encoded*, not encrypted.** Anyone with read access to the object, or to
> etcd, sees the value. A Secret committed to git is a plaintext credential leak.

**Making Secrets actually secure**
1. **Enable encryption at rest for etcd** (EKS: KMS envelope encryption)
2. **Restrict RBAC on secret reads** — `get secrets` in a namespace is equivalent to reading every
   credential in it
3. **Prefer an external store** — AWS Secrets Manager via the **Secrets Store CSI driver**, or the
   **External Secrets Operator**. The secret then lives in Secrets Manager with IAM control, audit,
   and rotation, and is projected into the pod at runtime
4. **Never commit manifests containing real secret values.** Reference them; never inline them

**Notes:** mounted secrets update like ConfigMaps; env-var secrets do not ·
`imagePullSecrets` for private registries (on EKS, prefer IAM-based ECR access) ·
`automountServiceAccountToken: false` where the pod needs no API access.

---

## Volumes

| Type | Lifetime | Use for |
|---|---|---|
| `emptyDir` | Dies with the pod | Scratch space, caches, sharing between containers in a pod |
| `configMap` / `secret` | Config as files | Configuration delivery |
| `persistentVolumeClaim` | Independent of the pod | Anything that must survive a restart |
| `hostPath` | Node's filesystem | **Avoid** — ties pods to nodes and escalates host access |

**Anything the application writes and needs later must be on a PVC or in external storage.** A
container's writable layer disappears with the pod. This is the most common cause of "my data
vanished after a restart".

---

## PersistentVolume, PersistentVolumeClaim, StorageClass

The three-part model:

| Object | What it is |
|---|---|
| **StorageClass** | A *type* of storage, and the provisioner that creates it dynamically |
| **PersistentVolume (PV)** | The actual storage resource |
| **PersistentVolumeClaim (PVC)** | A *request* for storage. The pod references this |

In practice you write a PVC naming a StorageClass; the provisioner creates the PV automatically.

### Access modes — this constrains your architecture

| Mode | Meaning | AWS |
|---|---|---|
| `ReadWriteOnce` (RWO) | Mounted read-write by **one node** | EBS |
| `ReadOnlyMany` (ROX) | Read-only by many nodes | EFS, some others |
| `ReadWriteMany` (RWX) | Read-write by **many nodes** | **EFS** (EBS cannot do this) |

**If two pods on different nodes must write the same volume, `ReadWriteOnce` will not work.** You
need EFS — which is significantly more expensive per GB. Discover this at design time, not when a
second replica sits `Pending` forever.

### Reclaim policy — a data-loss control

| Policy | On PVC deletion |
|---|---|
| `Delete` | **The underlying volume and its data are deleted.** Often the default |
| `Retain` | The PV and data survive; manual cleanup required |

**Set this deliberately.** `kubectl delete pvc` with `Delete` is a data-destroying command.

**Other notes:** EBS volumes are **AZ-bound** — a pod using one can only schedule in that AZ ·
volume expansion requires `allowVolumeExpansion: true` on the StorageClass, and shrinking is never
possible · StatefulSets create a PVC per pod via `volumeClaimTemplates`, and those PVCs survive
both scale-down and StatefulSet deletion.

---

## Configuration and Secret Management — Practical Guidance

**Configuration**
- Non-sensitive defaults in the image (`NODE_ENV`, `PORT`); everything environment-specific injected
- The **same image** must run in every environment. If it only runs in one, the boundary is broken
- Group related settings in one ConfigMap per component rather than scattering them

**Secrets**
- External store (Secrets Manager + CSI driver / External Secrets Operator) is the target state
- IRSA or Pod Identity gives the pod its own AWS identity to fetch them
- Rotation: the application must survive a value changing under it — either by re-reading, or by
  being restarted deliberately
- Never log secret values; never pass them on a command line

**Multi-environment** — use **Kustomize** overlays or **Helm** values rather than duplicating
manifests per environment. Explain the trade-off rather than assuming one: Kustomize is simpler
and template-free; Helm gives packaging, versioning, and a release lifecycle at the cost of
templating complexity.
