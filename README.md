# Proval

An open-source, privacy-first, easy-to-use self-hosted code review tool

> Proval is **Under development**. More features will keep being added and details my change.

## What it does

Proval reviews merge requests for you and can post comments on the change. You can set it to run on every event like merge request, or set it takes action only when someone @mentions the review agent.

## Features

**Git providers**

- GitLab

**LLM APIs**

- Chat Completions API (OpenAI-compatible)

MR review, threaded comments where the host allows it, configurable note replies, and a web UI for models and linked repositories.

## Development

From the repository root:

```bash
pnpm install
pnpm dev
```

Add `apps/api/.env` for local API settings. (`DB_FILE_NAME` for the local database file path)

## Build

```bash
docker build -t proval .
```

## License

Proval is licensed under the AGPL-3.0.
