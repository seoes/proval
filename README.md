![Proval](./docs/assets/hero.png)

# Proval

A Self-hosted LLM code review agent. Connect it to your Git host, bring your own model, and let it review pull requests and issues on your own infrastructure.

<!-- IMAGE_PLACEHOLDER: Screenshot of Proval review output on a pull request. Show a real code comment with suggestions on a diff. -->

- **Easy deploy**
  Proval takes 3 min, less than 10 lines to deploy to your server

- **Bring your own LLM (Even local models)**
  Proval works with OpenAI-compatible Chat Completions APIs, so you can use OpenAI, local model APIs like Ollama and llama.cpp, or any internal LLM gateway. Anthropic and Gemini support are planned as first-class integrations.

- **GitLab, Forgejo, and GitHub support**
  Proval supports GitLab, Forgejo, and GitHub. Gitea and Codeberg are also a natural fit through Forgejo-compatible APIs.

- **Run it on your own network**
  Use Proval inside an internal network, homelab, or privacy-focused environment without depending on an external review SaaS.

## Features

- **Pull request review**
  When a new pull request opens, Proval reads the diff, explores the codebase around the change, and posts an inline review with findings grouped by severity.

- **Deep research mode**
  For complex changes, Proval can run in deep research mode. It starts with a planning step that identifies specific review targets, spawns a sub-agent for each target to investigate independently, then writes a consolidated review from their findings. Each sub-agent explores the codebase on its own, so it can catch cross-file issues and hidden dependencies.

- **Inline comments**
  Findings are posted directly on the affected lines of code. Proval handles single-line and multi-line positions for GitHub, GitLab, and Forgejo.

- **Threaded replies**
  When someone replies to a Proval comment, it reads the thread context and responds. You can set it to reply only when mentioned or reply to every comment.

- **Issue commenting**
  Proval can comment on newly opened issues with relevant context from your codebase.

- **Activity tracking**
  Every review, reply, and issue comment is logged with token usage so you can track model costs.

- **Approval and rejection**
  Proval can approve or reject pull requests based on its review findings.

## Quick start

The easiest way to try Proval is to run it with Docker Compose

### Docker Compose (Recommended)

```yaml
services:
    proval:
        image: ghcr.io/proval:latest
        ports:
            - "7900:7900"
            - "7901:7901"
        volumes:
            - ./data:/data
        environment:
            - ENCRYPTION_KEY=[Encryption Key]
```

### Docker

```bash
docker run -d \
  --name proval \
  -p 7900:7900 \
  -p 7901:7901 \
  -v proval-data:/data \
  -e DB_FILE_NAME=/data/app.db \
  ghcr.io/proval:latest
```

## How it works

```text
Webhook event
  -> Repository settings
  -> Git provider API
  -> LLM agent with code review tools
  -> Review comments or replies

Deep research mode
  -> Planning agent
  -> Specialist sub-agents
  -> Final review agent
  -> Git provider comments
```

## Built with

- Bun
- Hono
- Sveltekit
- SQLite
- Drizzle

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

## Note

I looked for a self-hosted code review agent that works with GitLab or Forgejo and found almost nothing. Most review tools are SaaS, they lock you into their model, and they send your code to someone elses server. I run my home lab with local LLMs and wanted something that keeps everything on my network. So I built Proval.

Proval is still early. There are rough edges, missing features, and things that will break. I am actively developing it and feedback is the most useful thing you can give. Open an issue, start a discussion, or send a pull request.

## Roadmap

I believe the local LLM market is growing. Models keep getting better at code review, and running them on your own hardware keeps costs predictable and data private. Proval is built for that future. Short term plans include:

- More configurable review rules and custom prompts per repository.
- Better reviewer assignment and team workflow integration.
- Local model benchmarking so you can compare models before picking one.
- A public demo instance.

<!-- ## LICENSE -->
