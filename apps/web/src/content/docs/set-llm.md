---
title: "Set LLM"
description: "Add a model provider in Proval with Base URL, API key, and model ID."
order: 5
---

Proval sends review context to the LLM endpoint you configure. Your code and review context go only to the **Base URL** you set. Proval does not host or proxy models.

This guide covers how to fill in the model provider form in the dashboard. For ready-made endpoint values, see the example guides:

- [OpenRouter](/docs/openrouter): cloud models through one API key
- [llama.cpp](/docs/llama-cpp): local or on-prem inference

## Prerequisites

- Proval is running ([Quick Start](/docs/quick-start))
- You can open the dashboard at `http://<your-server>:7900`

---

## Choose an API provider

In **Model Provider → Add model provider**, pick the provider that matches your endpoint:

| Provider in Proval | Protocol | Use when |
| ------------------ | -------- | -------- |
| **OpenAI** | Chat Completions API | OpenRouter, llama.cpp, Ollama, vLLM, or any OpenAI-compatible server |
| **Anthropic** | Messages API | Anthropic directly, or a proxy that speaks the Messages API |

Most self-hosted and aggregator setups use **OpenAI (Chat Completions)**. Switch to **Anthropic** only when your endpoint expects the Messages API.

---

<h2 id="fill-in-the-model-form">Fill in the model provider form</h2>

1. Open the dashboard → **Model Provider** → **Add model provider**
2. Complete each field:

| Field | What to enter |
| ----- | ------------- |
| **Display Name** | A label for your team, e.g. `Main Reviewer` |
| **API Provider** | **OpenAI** or **Anthropic** (see above) |
| **Model ID** | The model name your API expects, e.g. `anthropic/claude-sonnet-4.6` or `llama-3.1-8b-instruct` |
| **Base URL** | Root URL of the API, including `/v1` when your server uses it, e.g. `https://openrouter.ai/api/v1` or `http://<llm-host>:8080/v1` |
| **API Key** | Key required by that endpoint (`sk-or-...`, `sk-ant-...`, or a placeholder if the server has no auth) |

<figure>
    <img src="/docs/set-llm/01-form.png" alt="Proval Create Model Provider form with all fields filled in" />
    <figcaption>Example: OpenAI provider with an OpenRouter base URL</figcaption>
</figure>

> **Base URL + API key** are the two values that define *where* requests go and *how* they authenticate. Get them from your provider. [OpenRouter](/docs/openrouter) and [llama.cpp](/docs/llama-cpp) walk through common cases.

---

<h2 id="test-and-save">Test and save</h2>

1. Click **Test Connection**. You should see **Connection successful**
2. Click **Create**

<figure>
    <img src="/docs/set-llm/02-test.png" alt="Proval connection test success dialog" />
    <figcaption>Successful connection test before saving</figcaption>
</figure>

If the test fails, double-check **Base URL**, **Model ID**, and **API Key** against your provider's docs. Wrong provider type (OpenAI vs Anthropic) is a common mistake.

---

## What's next

Connect your Git host and link a repository:

- [GitLab](/docs/gitlab)
- [Forgejo](/docs/forgejo)
- [GitHub](/docs/github)
