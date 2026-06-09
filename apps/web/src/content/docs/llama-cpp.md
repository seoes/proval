---
title: "llama.cpp example"
description: "Run a local llama.cpp server for Proval."
order: 6
---

[llama.cpp](https://github.com/ggml-org/llama.cpp) can serve a local model with an **OpenAI-compatible** HTTP API. This guide covers starting the server. To add the model in Proval, follow [Set LLM](/docs/set-llm).

## Prerequisites

- Proval is running on your server ([Quick Start](/docs/quick-start))
- A GGUF model file on that server

---

## Start the server

Run llama.cpp with the OpenAI-compatible HTTP server. Set an API key so only your clients can call the API:

```bash
llama-server -m /path/to/your-model.gguf --port 8080 --api-key <your-llm-api-key>
```

Confirm the server responds:

```
http://<llm-host>:8080/v1/models
```

Replace `<llm-host>` with the hostname or IP address of the machine running llama.cpp.

<figure>
    <img src="/docs/llama-cpp/01-server.png" alt="llama.cpp server running in a terminal" />
    <figcaption>llama.cpp server listening for API requests</figcaption>
</figure>

<blockquote>
<p><strong>If you run without <code>--api-key</code>, enter any placeholder in that field.</strong> We recommend run llama.cpp with <code>--api-key</code></p>
</blockquote>

In Proval, set **Base URL** to `http://<llm-host>:8080/v1`. See [Set LLM](/docs/set-llm) for the rest of the form and connection test.

---

## What's next

- [Set LLM](/docs/set-llm): add the model in Proval
- [GitLab](/docs/gitlab) · [Forgejo](/docs/forgejo) · [GitHub](/docs/github): connect a repository
