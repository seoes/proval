# Development of Proval

This project is called Proval, Self-hosted code review agent.

Below are the direction of Proval. You must consider these descriptions for future compatibility when you write/modify the code for Proval.

## About Proval

Proval is a self hosted, privacy focused AI code review agent. It connects to your Git Provider (GitHub, GitLab, Forgejo) via webhooks, runs a lightweight agent loop with your own LLM, and posts reviews and replies on your infrastructure. It is not an IDE copilot replacement. It's like a team's tool for code review with 'set and forget' config.

### Capabilities

- **Pull request review**. On PR or MR open, Proval reviews the diff and posts findings, including optional inline comments on changed lines.
- **Issue comments**. On issue open, Proval can leave an initial comment after checking related issues and pull requests.
- **Threaded replies**. On PR and issue comments, Proval can reply according to repository policy (`all`, `mentioned_only`, or `off`).

### Characteristics

- **User friendly**. Proval is designed to be UX-first. It's most important to be user friendly.
- **Super simple use**. Deploy must be easy with simple docker-compose.yml. Integration must be simple with webhook and provider API. Configuration must be crystal clear.
- **Bring your own model**. Connect any OpenAI compatible Chat Completions endpoint such as OpenAI, OpenRouter, Ollama, llama.cpp, or internal gateways. Anthropic is also supported. Point at a base URL and API key. You are not locked to a single vendor.
- **Multi Git Provider**. Works with Git Providers (GitHub, GitLab, Forgejo). Gitea and Codeberg fit through Forgejo compatible APIs. Integration uses webhooks and the provider API with an access token or a GitHub App.
- **Self hosted and container friendly**. Proval is open source. It runs on your network with a Docker image and keeps code and review context under your control.
- **Lightweight agent loop**. Reviews run through a small in house agent pipeline rather than a heavy external agent framework.

### Target users

Proval fits teams and operators that match most of the below.

- Teams on GitLab, Forgejo, or GitHub who want one self hosted review agent across those Git Providers
- Teams that want less of their code and review context sent to an external review SaaS
- Teams or homelab operators that already run local or internal LLM endpoints such as Ollama or llama.cpp
- Teams that dislike seat based AI pricing and prefer bringing their own model and API key
- Teams that want set and forget pull request review, issue comments, and threaded replies driven by repository webhooks

Proval is a weaker fit for people like the below.

- People who only want a managed SaaS and do not want to run or maintain a container
- Teams already happy with GitHub plus a hosted AI review or IDE agent and with no privacy or cost control need
- Teams with no interest in self hosted models or keeping review traffic on their own network

### Agent Workflow

A webhook event leads to repository settings, then the Git Provider API, then an LLM agent with tools, then review comments or replies logged as activity.

#### Pull Request Review

The plan agent groups changed files. Specialist sub agents run in parallel. The writing agent posts a summary and optional inline comments through the Git Provider.

#### Issue Comment

When an issue opens and the setting is enabled, a single agent gathers context from related issues and PRs and posts an opening comment.

#### Reply

When a user comments on a PR or issue, a reply agent reads thread context and responds per repository reply policy. It skips the bot's own comments.

## Development

### Project Structure

This project is Monorepo architecture using Bun workspace.

```
.
├── apps/
   ├── api/
   ├── client/
   ├── web/
├── packages/
   ├── config/
   ├── db/
   ├── types/
├── .env
├── .env.example
├── bun.lock
├── package.json
├── Dockerfile
├── README.md
...
```

#### App

##### client

apps/client/ is a web dashboard for Proval. It's built with Sveltekit. It's called client, frontend or dashboard. It uses 7902 port for development. while deployment, it's built as static site and served by api(7900) server.

##### api

apps/api/ is a API server for Proval. It's built with Bun. It's called api, backend or server. It has 2 ports. 7900 for API and 7901 for Webhook receive from Git Provider.

##### web

apps/web/ is a web application for Proval. It's built with Bun. It's called landing page, website. It uses 7903 port for development. It's deployed by Cloudflare Pages through GitHub Actions.

##### web OG images

Open Graph images for the landing site live in `apps/web/static/` (`og.png`, `og-alternatives.png`, `og-coderabbit.png`, `og-qodo.png`, `og-greptile.png`, `og-graphite.png`). Size is always `1200x630`.

**Design direction**

- Palette is primary (`#006fea`, from site `--primary`), white, and black only.
- Layout should feel like a clean HTML/CSS landing hero, not a generic Magick poster.
- Keep large bold headlines with primary accent on the key phrase.
- Keep the Proval mark (`P` on a primary rounded square) plus brand name, an optional monospace eyebrow, and a short supporting sentence.
- Bottom primary bar is allowed as a thin brand accent.
- Do not add chip/pill buttons, `proval.app` URL text, glassmorphism, frosted cards, inset rounded rectangles, diagonal slash panels, or grid textures.
- Background must be a simple soft gradient (white into a light primary tint). No decorative noise.

**Workflow**

1. Edit the HTML/CSS template at `apps/web/scripts/og-html/card.html`.
2. Update copy variants in `apps/web/scripts/render-og.ts` when titles or subtitles change.
3. Render with Chrome headless from `apps/web`:

```bash
bun scripts/render-og.ts
```

4. Confirm each PNG under `apps/web/static/` is `1200x630` and matches the design rules above.
5. Wire page specific images through `SeoHead` (`ogImagePath`) and competitor `ogImagePath` in `competitorList.ts`.

When adding a new alternatives page, add a matching OG file, a `render-og.ts` card entry, and the `ogImagePath` field together.

### Rules

- Do not use emdash, semicolon, colon or hyphen while writing something. especially in English.
- Do not use plural nouns for directory, file, function, variable name. Use -List suffix instead, or use singular nouns.
- Bun, Sveltekit and SQLite is mainly used for development.
- Lightweight and simple architecture/code is preferred.
    - Don't create additional files or export/import functions for same functionality all the time. It has more maintenance cost sometimes. But if the code is used very widely in project, You can judge to create function and export/import it.
    - Avoid unnecessary dependencies. prefer lightweight dependency. But if you can implement it more lightweight, That's better so do it.
    - Creating new package(packages/) is allowed if it's necessary.
- English is the main language on this project.

## Community Edition and Enterprise Edition

Proval is started from just Open Sourced project, but planned to be separated into Community Edition(CE) and Enterprise Edition(EE). It's like a 'open core' model. ex. GitLab, Plausible, Mattermost

CE and EE is all self-hosted. Features of EE will be stay in Repository and be protected by license.

Community Edition will be free to use. You can use core features of Proval.
Enterprise Edition will be paid. You can use Premium features of Proval.

### SaaS Cloud Service

Proval is Self-hosted project, but planned to be launched to SaaS Cloud Service in the future. It will be based on Cloudflare Workers, D1. You must consider compatibility with 'cloudflare workers and d1' when you write/modify the code for Proval.

### Core Features (CE, Basic Plan from SaaS)

- Pull Request Review
- Pull Request Approval/Rejection
- Issue Management
- Reply

### Premium Features (EE, Premium Plan from SaaS)

- SSO
- RBAC
- Audit Log
- Team Management
- Centralized Configuration
