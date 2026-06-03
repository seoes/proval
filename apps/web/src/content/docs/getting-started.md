---
title: "Getting started"
description: "Clone the repo and run Proval locally for development."
order: 1
---

## Requirements

- [Bun](https://bun.sh) for the monorepo
- Docker for container deployment

## Local development

From the repository root:

```bash
git clone git@github.com:proval/proval.git
cd proval
bun install
bun dev
```

Open the admin UI, add a model, connect your Git provider, and link a repository.

## What happens next

1. Configure webhooks on your Git host to point at your Proval instance.
2. Open a merge request.
3. Confirm that Proval receives the event and posts a review comment.
