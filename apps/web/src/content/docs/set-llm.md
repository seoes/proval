---
title: "Set LLM"
description: "Add a model provider in Proval with Base URL and API key."
order: 5
---

Proval sends review context to the LLM endpoint you configure. Your code and review context go only to the **Base URL** you set. Proval does not host or proxy models.

This guide covers how to fill in the model provider form in the dashboard. For ready-made endpoint values, see the example guides:

- [OpenRouter](/docs/openrouter): cloud models through one API key
- [llama.cpp](/docs/llama-cpp): local or on-prem inference

To use a ChatGPT plan or xAI subscription instead of an API key, see [OAuth subscription](/docs/oauth).

## Prerequisites

- Proval is running ([Quick Start](/docs/quick-start))
- You can open the dashboard at `http://<your-server>:7900`

---

## Choose an API provider

In **Model Provider → Add Model Provider → API Key**, pick the provider that matches your endpoint:

| Provider in Proval | Protocol             | Use when                                                                   |
| ------------------ | -------------------- | -------------------------------------------------------------------------- |
| **OpenAI**         | Chat Completions API | OpenRouter, llama.cpp, Ollama, vLLM, or any OpenAI-compatible server       |
| **OpenAI**         | Responses API        | OpenAI directly, or a gateway that speaks the Responses API (`/responses`) |
| **Anthropic**      | Messages API         | Anthropic directly, or a proxy that speaks the Messages API                |

Most self-hosted and aggregator setups use **OpenAI (Chat Completions)**. Choose **OpenAI (Responses)** for OpenAI reasoning models, since the Responses API keeps their reasoning between tool calls. Switch to **Anthropic** only when your endpoint expects the Messages API.

---

<h2 id="fill-in-the-model-form">Fill in the model provider form</h2>

1. Open the dashboard → **Model Provider** → **Add Model Provider** → **API Key**
2. Complete each field:

| Field            | What to enter                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Display Name** | A label for your team, e.g. `Main Reviewer`                                                                                       |
| **API Provider** | **OpenAI (Chat Completions)**, **OpenAI (Responses)**, or **Anthropic** (see above)                                               |
| **Base URL**     | Root URL of the API, including `/v1` when your server uses it, e.g. `https://openrouter.ai/api/v1` or `http://<llm-host>:8080/v1` |
| **API Key**      | Key required by that endpoint (`sk-or-...`, `sk-ant-...`, or a placeholder if the server has no auth)                             |

<figure>
    <img src="/docs/set-llm/01-form.png" alt="Proval Create Model Provider form with all fields filled in" />
    <figcaption>Example: OpenAI provider with an OpenRouter base URL</figcaption>
</figure>

> **Base URL + API key** are the two values that define _where_ requests go and _how_ they authenticate. Get them from your provider. [OpenRouter](/docs/openrouter) and [llama.cpp](/docs/llama-cpp) walk through common cases.

---

<h2 id="test-and-save">Test and save</h2>

1. Click **Test Connection**, enter a model ID your API accepts (e.g. `anthropic/claude-sonnet-4.6` or `llama-3.1-8b-instruct`), and click **Test**. You should see **Connection successful**. The model ID is only used for the test and is not saved
2. Click **Create**

You choose the model for reviews later, in each repository's settings.

<figure>
    <img src="/docs/set-llm/02-test.png" alt="Proval connection test success dialog" />
    <figcaption>Successful connection test before saving</figcaption>
</figure>

If the test fails, double-check **Base URL**, **Model ID**, and **API Key** against your provider's docs. Wrong provider type (Chat Completions, Responses, or Anthropic) is a common mistake.

---

## What's next

Connect your Git host and link a repository:

- [GitLab](/docs/gitlab)
- [Forgejo](/docs/forgejo)
- [GitHub](/docs/github)
