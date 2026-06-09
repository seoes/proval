---
title: "Quick Start"
description: "Run Proval with Docker Compose and open the dashboard."
order: 1
---

## Requirements

- Docker and Docker Compose on the machine that will host Proval

## Run with Docker Compose

Create a `docker-compose.yml` file:

```yaml
services:
    proval:
        image: ghcr.io/proval/proval:latest
        ports:
            - "7900:7900"
            - "7901:7901"
        volumes:
            - proval-data:/data
        environment:
            DB_FILE_NAME: /data/app.db

volumes:
    proval-data:
```

Start the stack:

```bash
docker compose up -d
```

On your browser, open the dashboard:

<figure>
    <img src="/docs/quick-start/01-dashboard.png" alt="Proval dashboard in the browser" />
</figure>

```
http://<your-server>:7900
```

Replace `<your-server>` with your server hostname or IP address.

<h2 id="network">Network</h2>

| Port     | Purpose          |
| -------- | ---------------- |
| **7900** | Dashboard        |
| **7901** | Receive Webhooks |

Configure your Git provider to send webhooks to port **7901** on your Proval instance.

```
http://<your-server>:7901/webhook/gitlab
http://<your-server>:7901/webhook/forgejo
http://<your-server>:7901/webhook/github
```

<blockquote class="doc-warning">
<p>On a private LAN, GitLab and Forgejo block <code>http://</code> webhook URLs by default. Before you use one, follow the setup in the <a href="/docs/gitlab#allow-internal-webhooks">GitLab</a> and <a href="/docs/forgejo#allow-internal-webhooks">Forgejo</a> guides.</p>
</blockquote>

<h2 id="https">HTTPS</h2>

<blockquote class="doc-warning">
<p>GitHub requires a public <code>https://</code> URL for webhooks. Set up HTTPS before you connect.</p>
</blockquote>

To use HTTPS, put a reverse proxy in front of Proval. Common choices:

- **nginx**
- **Caddy**
- **Traefik**
- **Cloudflare Tunnel**

```
http://<your-server>:7901/webhook/gitlab  →  https://example.com/webhook/gitlab
```

Details depend on your Git host. See [GitLab](/docs/gitlab), [Forgejo](/docs/forgejo), or [GitHub](/docs/github).

## What's next

1. [Set LLM](/docs/set-llm), or [OpenRouter](/docs/openrouter) / [llama.cpp](/docs/llama-cpp) for example endpoint values
2. Your Git provider: [GitLab](/docs/gitlab) · [Forgejo](/docs/forgejo) · [GitHub](/docs/github)
