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
- A [model provider configured](/docs/set-llm) in Proval
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

Choose one path.

**Manual (default)**

1. **Repositories** → **Add repository**
2. Fill in the form
3. **Create**

The connection account must already be a Maintainer on the project. Use the same webhook secret in Step 3.

**Automatic registration**

1. On the GitLab connection card, open the settings (gear) icon and go to **Edit connection**
2. Turn on **Automatic repository registration**, fill in **Default Config** including the webhook secret, and save
3. Share the webhook URL and secret with your team. On each project they add the connection account as a member with **Maintainer** or above, then add the project webhook
4. On the first merge request, issue, or comment, Proval registers the repository. You do not add each repository in the dashboard first

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

Merge request events include open, reopen, and update (push or draft to ready). Proval reviews on first push or every push per repository settings, and skips draft MRs until they become ready. Close and merge use the same webhook event. Repository settings decide whether an in flight review keeps running or is canceled.

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
- **404** — repository not registered in Proval, automatic registration is off, or the connection account is not a Maintainer on the project
- **Blocked / local network** — [Allow internal webhooks](#allow-internal-webhooks)
- **No review** — GitLab cannot reach port 7901, or events not enabled
- **Test connection fails** — invalid token, wrong base URL, or missing `api` scope
