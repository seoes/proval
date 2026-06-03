---
title: "Docker Compose"
description: "Run Proval on your own server in a few minutes."
order: 2
---

## Compose file

Create `docker-compose.yml`:

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

## After install

1. Open the web UI and complete setup.
2. Ensure your Git host can reach the webhook URL.
3. Trigger a test merge request and confirm a review comment appears.

Persist the `/data` volume for SQLite and configuration across restarts.
