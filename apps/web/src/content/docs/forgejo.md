---
title: "Forgejo"
description: "Connect Forgejo to Proval with a personal access token and repository webhook."
order: 3
---

Connect Forgejo to Proval with a personal access token, the Proval dashboard forms, and a repository webhook.

<blockquote class="doc-warning">
<p><strong>External network.</strong> If Forgejo reaches Proval over the public internet, use <strong><code>https://</code></strong> (reverse proxy in front of port 7901). Internal LAN <code>http://</code> is fine for many self-hosted setups.</p>
</blockquote>

## Prerequisites

- [Quick Start](/docs/quick-start) completed. Proval is running
- A [model provider configured](/docs/set-llm) in Proval
- Forgejo can reach Proval on port **7901** ([Network](/docs/quick-start#network))

## Step 1: Personal access token

Use a dedicated Forgejo user for reviews (for example `proval`) and create the token on that account.

1. Profile → **Settings** → **Applications** → **Generate New Token**
2. Select **`read_api`** and **`write_repository`**

<figure>
    <img src="/docs/forgejo/01-pat.png" alt="Forgejo personal access token with API scopes" />
</figure>

## Step 2: Connect in Proval

### Forgejo connection

1. Dashboard → **Git Provider** → **Add Forgejo connection**
2. Fill in the form
3. **Test Connection**, then save

<figure>
    <img src="/docs/forgejo/02-form.png" alt="Proval Forgejo connection form" />
</figure>

### Repository

Choose one path.

**Manual (default)**

1. **Repositories** → **Add repository**
2. Fill in the form
3. **Create**

The connection user must already be a collaborator with **Write** access. Use the same webhook secret in Step 3.

**Automatic registration**

1. On the Forgejo connection card, open the settings (gear) icon and go to **Edit connection**
2. Turn on **Automatic repository registration**, fill in **Default Config** including the webhook secret, and save
3. Share the webhook URL and secret with your team. On each repository they add the connection user as a collaborator with **Write** access, then add the repository webhook
4. On the first pull request, issue, or comment, Proval registers the repository. You do not add each repository in the dashboard first

## Step 3: Repository webhook

```
http://<your-server>:7901/webhook/forgejo
```

Use `https://` when TLS terminates before Proval. LAN `http://` may require [allow internal webhooks](#allow-internal-webhooks).

1. Repository → **Settings** → **Webhooks** → **Add Webhook** → **Forgejo**
2. Fill in the form
3. Select **All events**, or **Custom events** and enable:
    - Pull request events → **Modification**
    - Pull request events → **Comments**
    - Issue events → **Modification**
    - Issue events → **Comments**

Pull request modification covers open, sync, reopen, and ready for review. Proval reviews on first push or every push per repository settings, and skips drafts until ready. Close and merge use the same webhook event. Repository settings decide whether an in flight review keeps running or is canceled.

<figure>
    <img src="/docs/forgejo/03-webhook.png" alt="Forgejo webhook form with URL and secret" />
</figure>

Instance admins can add the same webhook for all repositories under **Site administration** → **Default webhooks**.

<h2 id="allow-internal-webhooks">Allow internal HTTP webhooks</h2>

When Forgejo and Proval are on a private LAN with plain `http://`:

1. Edit Forgejo `app.ini` (no GUI)
2. Set `ALLOWED_HOST_LIST` and restart Forgejo

```ini
[webhook]
ALLOWED_HOST_LIST = private,192.168.1.10
```

Docker Compose:

```yaml
environment:
    - GITEA__webhook__ALLOWED_HOST_LIST=private,192.168.1.10
```

See [Forgejo: webhook config](https://forgejo.org/docs/latest/admin/config-cheat-sheet/).

## Troubleshooting

- **401** — secret does not match Proval
- **404** — repository not registered in Proval, automatic registration is off, or the connection user is not a collaborator on the repository
- **Host not allowed** — [Allow internal webhooks](#allow-internal-webhooks)
- **No review** — Forgejo cannot reach port 7901, or events not enabled
- **Test connection fails** — invalid token or missing scopes
