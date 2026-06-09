---
title: "GitLab"
description: "Connect GitLab to Proval with a personal access token and project webhook."
order: 2
---

Connect GitLab to Proval with a personal access token, the Proval dashboard forms, and a project webhook.

<blockquote class="doc-warning">
<p><strong>External network.</strong> If GitLab reaches Proval over the public internet, use <strong><code>https://</code></strong> (reverse proxy in front of port 7901). Internal LAN <code>http://</code> is fine for many self-hosted setups.</p>
</blockquote>

## Prerequisites

- [Quick Start](/docs/quick-start) completed. Proval is running
- A [model configured](/docs/set-llm) in Proval
- GitLab can reach Proval on port **7901** ([Network](/docs/quick-start#network))

## Step 1: Personal access token

1. **Preferences** → **Access Tokens**
2. Create a token with the **`api`** scope

<figure>
    <img src="/docs/gitlab/01-pat.png" alt="GitLab personal access token with api scope" />
</figure>

## Step 2: Connect in Proval

### GitLab connection

1. Dashboard → **Git Provider** → **Add GitLab connection**
2. Fill in the form
3. **Test Connection**, then save

<figure>
    <img src="/docs/gitlab/02-form.png" alt="Proval GitLab connection form" />
</figure>

### Repository

1. **Repositories** → **Add repository**
2. Fill in the form
3. **Create**

Use the same webhook secret in Step 3.

## Step 3: Project webhook

```
http://<your-server>:7901/webhook/gitlab
```

Use `https://` when TLS terminates before Proval. LAN `http://` may require [allow internal webhooks](#allow-internal-webhooks).

1. Project → **Settings** → **Webhooks**
2. Fill in the form
3. Enable:
    - **Merge request events**
    - **Comments**
    - **Issues events**

<figure>
    <img src="/docs/gitlab/03-webhook.png" alt="GitLab project webhook form with URL and secret" />
</figure>

<h2 id="allow-internal-webhooks">Allow internal HTTP webhooks</h2>

When GitLab and Proval are on a private LAN with plain `http://`:

1. **Admin** → **Settings** → **Network** → **Outbound requests**
2. Enable **Allow requests to the local network from webhooks and integrations**, or add Proval's IP to the allowlist

<figure>
    <img src="/docs/gitlab/04-ip-webhook.png" alt="GitLab project webhook form with URL and secret" />
</figure>

See [GitLab: Filtering outbound requests](https://docs.gitlab.com/security/webhooks/).

## Troubleshooting

- **401** — secret does not match Proval
- **404** — repository not registered in Proval
- **Blocked / local network** — [Allow internal webhooks](#allow-internal-webhooks)
- **No review** — GitLab cannot reach port 7901, or events not enabled
- **Test connection fails** — invalid token, wrong base URL, or missing `api` scope
