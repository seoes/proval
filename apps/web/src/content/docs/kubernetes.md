---
title: "Kubernetes example"
description: "A single replica reference for running Proval on Kubernetes. Not an official Helm chart."
order: 2
---

This page is a **reference example**. Docker Compose remains the recommended install. There is no official Helm chart.

<blockquote class="doc-warning">
<p>Keep <strong>one replica</strong>. Proval stores SQLite and workspaces under <code>/data</code>. Use <code>Recreate</code> so two pods never share the volume. Pin an image tag instead of <code>latest</code>.</p>
</blockquote>

## Contract

| Item | Value |
| ---- | ----- |
| **Image** | `ghcr.io/seoes/proval:<tag>` |
| **Ports** | **7900** dashboard, **7901** webhooks |
| **Volume** | `/data` |
| **Env** | `ENCRYPTION_KEY`, `DB_FILE_NAME=/data/app.db`. Optional `COOKIE_SECURE=true` when the dashboard is served over HTTPS |
| **Health** | `GET /api/health` on port **7900** |

Generate `ENCRYPTION_KEY` with `openssl rand -base64 32`.

## Example manifests

Replace the encryption key and pin an image tag before you apply this in a real cluster.

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: proval
type: Opaque
stringData:
  encryption-key: "[Encryption Key]"
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: proval-data
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: proval
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: proval
  template:
    metadata:
      labels:
        app: proval
    spec:
      containers:
        - name: proval
          image: ghcr.io/seoes/proval:latest
          ports:
            - name: dashboard
              containerPort: 7900
            - name: webhook
              containerPort: 7901
          env:
            - name: ENCRYPTION_KEY
              valueFrom:
                secretKeyRef:
                  name: proval
                  key: encryption-key
            - name: DB_FILE_NAME
              value: /data/app.db
          volumeMounts:
            - name: data
              mountPath: /data
          readinessProbe:
            httpGet:
              path: /api/health
              port: 7900
          livenessProbe:
            httpGet:
              path: /api/health
              port: 7900
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: proval-data
---
apiVersion: v1
kind: Service
metadata:
  name: proval
spec:
  selector:
    app: proval
  ports:
    - name: dashboard
      port: 7900
      targetPort: dashboard
    - name: webhook
      port: 7901
      targetPort: webhook
```

## HTTPS

Put an Ingress (or another reverse proxy) in front of ports **7900** and **7901**. Ingress annotations depend on your cluster. This example does not include them.

When the dashboard is reached over HTTPS, add `COOKIE_SECURE=true` to the Deployment so the session cookie is marked Secure.

```yaml
- name: COOKIE_SECURE
  value: "true"
```

Webhook URLs still use the paths from [Quick Start](/docs/quick-start#network).

## What's next

1. [Set LLM](/docs/set-llm), or [OpenRouter](/docs/openrouter) / [llama.cpp](/docs/llama-cpp) for example endpoint values
2. Your Git provider: [GitLab](/docs/gitlab) · [Forgejo](/docs/forgejo) · [GitHub](/docs/github)
