---
title: "OpenLLM example"
description: "Connect OpenLLM to Proval for model routing."
order: 8
---

[OpenLLM](https://www.openllm.sh) routes API keys, OAuth subscription accounts, and local models through one format agnostic endpoint. This guide connects Proval to the OpenLLM cloud gateway with the Chat Completions API.

## Prerequisites

- Proval is running ([Quick Start](/docs/quick-start))
- An OpenLLM API key from [Devices & keys](https://www.openllm.sh)

---

## Add OpenLLM

1. In the Proval dashboard, open **Model Provider** and select **Add Model Provider**
2. Choose **OpenLLM**. Proval fills in the OpenAI Chat Completions provider and `https://www.openllm.sh/v1`
3. Enter your OpenLLM API key
4. Click **Test Connection** and enter `lite` as the model ID
5. Click **Create**

OpenLLM provides the full `/v1/` API surface. Proval uses its Chat Completions API for review requests, including streaming and tool calls when the selected model supports them.

## Choose models

Set a repository model ID to `lite` for a fast, low cost built in chain. You can also use a model ID from your OpenLLM model list. The `ultra`, `plus`, and `lite` aliases depend on the sources you have configured, so select a model ID returned by OpenLLM when an alias is unavailable.

Cloud served sources work from the Proval host. Subscription accounts and local models require an online device running the OpenLLM daemon.

---

## What's next

- [Set LLM](/docs/set-llm): configure model providers and repository model IDs
- [Routing](https://docs.openllm.sh/routing): learn how OpenLLM selects model sources
- [GitLab](/docs/gitlab) · [Forgejo](/docs/forgejo) · [GitHub](/docs/github): connect a repository
