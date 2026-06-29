---
title: "OpenRouter example"
description: "Create an OpenRouter API key for Proval."
order: 7
---

[OpenRouter](https://openrouter.ai) exposes many cloud models through a single **OpenAI-compatible** API. This guide covers creating an API key. To add the model provider in Proval, follow [Set LLM](/docs/set-llm).

## Prerequisites

- Proval is running ([Quick Start](/docs/quick-start))

---

## Create an API key

1. Sign in at [openrouter.ai](https://openrouter.ai)
2. Open **[API Keys](https://openrouter.ai/workspaces/default/keys)** in your workspace
3. Click **New Key**, give it a name, and click **Create**
4. Copy the key (`sk-or-...`)

<figure>
    <img src="/docs/openrouter/01-key.png" alt="OpenRouter Create Key dialog" />
    <figcaption>Create an API key in OpenRouter</figcaption>
</figure>

When you fill in the model provider form, use Base URL `https://openrouter.ai/api/v1`, API Provider **OpenAI**, and your `sk-or-...` key. Choose a [model ID](https://openrouter.ai/models) for the **Model ID** field. See [Set LLM](/docs/set-llm) for the full form and connection test.

---

## What's next

- [Set LLM](/docs/set-llm): add the model provider in Proval
- [GitLab](/docs/gitlab) · [Forgejo](/docs/forgejo) · [GitHub](/docs/github): connect a repository
