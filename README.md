# Proval

A self-hosted AI code review agent. Plug it into your Git host, pick an LLM, and let it review merge requests and issues on your own infrastructure.

<!-- IMAGE_PLACEHOLDER: Screenshot of Proval review output on a pull request. Show a real code comment with suggestions on a diff. -->

## Why this exists

ernet I looked for a self-hosted code review agent that works with GitLab or Forgejo and found almost nothing. Most review tools are SaaS, they lock you into their model, and they send your code to someone elses server. I run a homelab with local LLMs and wanted something that keeps everything on my network. So I built Proval.

## Quick start

```bash
docker run -d \
  --name proval \
  -p 7900:7900 \
  -p 7901:7901 \
  -v proval-data:/data \
  -e DB_FILE_NAME=/data/app.db \
  your-registry/proval:latest
```

Then open http://localhost:7900, add an LLM model and a Git provider, connect a repository, and you are done.

## Docker Compose

```yaml
version: "3"
services:
  proval:
    image: your-registry/proval:latest
    ports:
      - "7900:7900"
      - "7901:7901"
    volumes:
      - proval-data:/data
    environment:
      DB_FILE_NAME: /data/app.db
      NODE_ENV: production

volumes:
  proval-data:
```

Set up nginx or a reverse proxy for HTTPS and that is it.

## Git providers

Proval supports three Git hosts with the same set of features:

- GitHub (via GitHub App installation)
- GitLab (via personal access token)
- Forgejo (via access token)

## LLM support

Proval uses the OpenAI Chat Completions API format. This works with OpenAI, Anthropic, any OpenAI-compatible proxy, Ollama, llama.cpp, and most local model runners point your LLM at the same endpoint format and it just works.

## Features

**Pull request review**
When a new pull request or merge request opens, Proval reads the diff, explores the codebase around the change, and posts an inline review with findings grouped by severity.

**Deep research mode**
For complex changes, Proval can run in deep research mode. It starts with a planning step that identifies specific review targets, spawns a sub-agent for each target to investigate independently, then writes a consolidated review from their findings. Each sub-agent explores the codebase on its own, so it can catch cross-file issues and hidden dependencies.

**Inline comments**
Findings are posted directly on the affected lines of code. Proval handles single-line and multi-line positions for GitHub, GitLab, and Forgejo.

**Threaded replies**
When someone replies to a Proval comment, it reads the thread context and responds. You can set it to reply only when mentioned or reply to every comment.

**Issue commenting**
Proval can comment on newly opened issues with relevant context from your codebase.

**Approval and rejection**
Proval can approve or reject pull requests based on its review findings.

**Activity tracking**
Every review, reply, and issue comment is logged with token usage so you can track model costs.

## How it works

Proval has two servers in one binary:

- Port 7900 serves the web UI and REST API.
- Port 7901 receives webhooks from your Git host.

When a webhook arrives (new PR, new comment, new issue), Proval looks up the repository config, creates a provider adapter for your Git host, and runs the agent loop. The agent has tool access to read diffs, browse files, search the codebase, and post comments. It keeps going until it finishes or hits the step limit.

Deep research adds two more layers. First a planning agent scans all changed files and builds a list of review targets. Then one sub-agent per target runs independently with its own tool access. Finally a writing agent collects all findings and posts the review. This is how Proval catches problems that span multiple files.

## Setup from scratch

1. Add an LLM model in the Models page. You need a base URL and an API key.
2. Add a Git provider access in the Providers page. For GitLab and Forgejo you need a personal access token with API scope. For GitHub you install the Proval GitHub App.
3. Create a repository entry. Pick a provider and select a repository from the list. Configure review settings (inline review, deep research, reply mode, language).
4. Set up the webhook in your Git host pointing to http://your-server:7901/webhook/gitlab (or /github or /forgejo). Use the webhook secret shown in the repository detail page.
5. Done. Open a pull request and Proval reviews it.

## Development

```bash
git clone git@github.com:your-org/proval.git
cd proval
bun install
cp apps/api/.env.example apps/api/.env
# fill in your env vars
bun dev
```

The dev command starts both the API server (port 7900) and the SvelteKit dev server with hot reload.

## Demo

You can run Proval against mock inputs to see how it reviews without setting up real webhooks.

```bash
cd apps/api
cp .env.demo.example .env.demo
# fill in OPENAI_API_KEY etc
bun run demo simple-bugfix
```

<!-- DEMO_PAGE_PLACEHOLDER: Link to a live demo page where visitors can try Proval without installing. -->

## Roadmap

I believe the local LLM market is growing. Models keep getting better at code review, and running them on your own hardware keeps costs predictable and data private. Proval is built for that future. Short term plans include:

- More configurable review rules and custom prompts per repository.
- Better reviewer assignment and team workflow integration.
- Local model benchmarking so you can compare models before picking one.
- A public demo instance.

## Early stage note

Proval is still early. There are rough edges, missing features, and things that will break. I am actively developing it and feedback is the most useful thing you can give. Open an issue, start a discussion, or send a pull request.

## License

AGPL-3.0
