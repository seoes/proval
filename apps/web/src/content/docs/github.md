---
title: "GitHub"
description: "Connect GitHub to Proval with a GitHub App and repository linking."
order: 4
---

<blockquote class="doc-warning">
<p>GitHub requires a public <code>https://</code> URL for webhooks. Set up HTTPS before you connect.</p>
</blockquote>

GitHub integration uses a **GitHub App**. Proval can create the app via quick setup, or you can register an existing app manually. Per-repository webhooks are not configured by hand. The App handles delivery.

## Prerequisites

- [Quick Start](/docs/quick-start) completed. Proval is running
- A [model configured](/docs/set-llm) in Proval
- A public **`https://`** URL reachable from GitHub ([HTTPS](/docs/quick-start#https); webhooks use port **7901**)

---

<h2 id="public-url-and-https">Public URL and HTTPS</h2>

**Webhook URL pattern:**

```
https://<public-host>/webhook/github
```

Include the port if needed: `https://<public-host>:7901/webhook/github`.

Terminate TLS with **nginx**, **Caddy**, **Traefik**, or **Cloudflare Tunnel** and forward to port **7901**:

```
https://proval.example.com/webhook/github   →   http://127.0.0.1:7901/webhook/github
```

The dashboard can share the same hostname (→ **7900**) or stay on an internal port.

---

## Quick setup (recommended)

### Step 1: Start GitHub App registration

1. Dashboard → **Git Provider** → **Connect GitHub App**
2. **Quick setup** → **Continue**
3. Enter your public base URL (e.g. `https://proval.example.com`), then **Next**

### Step 2: Create the app on GitHub

Review permissions on GitHub and click **Create GitHub App**. You return to Proval automatically.

<figure>
    <img src="/docs/github/01-app.png" alt="GitHub App" />
</figure>

### Step 3: Connect a GitHub account (installation)

1. **Connect GitHub account**
2. Select user or organization and repositories
3. Complete the installation flow

<figure>
    <img src="/docs/github/02-install.png" alt="Connected GitHub account in Proval" />
</figure>

### Step 4: Add a repository in Proval

1. **Repositories** → **Add repository**
2. Select your GitHub installation and repository
3. Configure model provider and review settings. No webhook secret needed
4. **Create**

---

## Existing app (manual)

1. **Git Provider** → **Connect GitHub App** → **Existing app**
2. Fill in **App ID**, **Slug**, **Private key (PEM)**, **Webhook secret**, **Public base URL**
3. Confirm the webhook URL matches your GitHub App settings
4. **Test Connection**, **Save**
5. Connect account and add repositories as in Steps 3 and 4

The app must subscribe to **`pull_request`** and **`issue_comment`** (quick setup sets these automatically).

---

## Troubleshooting

| Symptom                           | Likely cause                                                 |
| --------------------------------- | ------------------------------------------------------------ |
| Redirect fails after app creation | Public HTTPS URL not reachable; check firewall and proxy     |
| No repositories in dropdown       | Installation missing repository access                       |
| No review on PR                   | App not installed on the repository, or webhook URL mismatch |
| 401 on webhook                    | Webhook secret in GitHub App settings does not match Proval  |
