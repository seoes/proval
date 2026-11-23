---
title: "OAuth subscription"
description: "Connect Proval to your ChatGPT plan or xAI subscription with OAuth instead of an API key."
order: 8
---

Proval can sign in to a model subscription you already pay for instead of using an API key. It uses the **device code** flow, so it works on a headless server. You approve the connection in your browser, and Proval stores the tokens encrypted with `ENCRYPTION_KEY` and renews them automatically.

> Subscription OAuth is meant for personal use. A subscription belongs to one person, and Proval shares its usage limits with your own use. For a team or public repositories, use an API key with [Set LLM](/docs/set-llm).

## Prerequisites

- Proval is running ([Quick Start](/docs/quick-start))
- A ChatGPT plan with Codex access, or an xAI subscription

---

## OpenAI (ChatGPT plan)

### Turn on device code authorization

OpenAI blocks device code sign in until you allow it.

1. Open **[ChatGPT Security Settings](https://chatgpt.com/#settings/Security)**
2. Turn on **device code authorization for Codex**

On a ChatGPT workspace plan such as Business, Enterprise, or Edu, a workspace admin has to allow it. If you cannot find the option, ask your admin.

### Connect

1. Open the dashboard → **Model Provider** → **Add Model Provider** → **OpenAI OAuth (ChatGPT plan)**
2. Fill in **Display Name**, the concurrency fields, and **Response Timeout**
3. Click **Connect to OpenAI**. Proval shows a code
4. Click **Open OpenAI**, sign in, enter the code, and approve
5. Proval saves the provider as soon as you approve. The code expires after 15 minutes

### Good to know

- If approval never finishes, device code authorization is probably off. Turn it on and click **Connect to OpenAI** again
- Reviews count against the Codex usage limits of your ChatGPT plan, which reset in 5 hour and weekly windows
- Pick a model in the repository settings. Proval loads the list of models your plan can use
- Reasoning effort supports `minimal`, `low`, `medium`, `high`, and `xhigh`
- Proval signs in the same way Codex CLI does, so the approval page may show Codex. This is not an official OpenAI integration and it may change without notice

---

## xAI

### Connect

1. Open the dashboard → **Model Provider** → **Add Model Provider** → **xAI OAuth**
2. Fill in **Display Name**, the concurrency fields, and **Response Timeout**
3. Click **Connect to xAI**. Proval shows a code
4. Click **Open xAI**, sign in, and approve the code
5. Proval saves the provider as soon as you approve

### Good to know

- Model access depends on your xAI subscription. Pick a model in the repository settings
- Reasoning effort supports `low`, `medium`, `high`, and `xhigh`

---

## Reconnect and remove

- Open the provider and click **Test Connection** with a model ID to check that it works
- When Proval cannot renew the tokens, for example after a password change or a revoked session, the provider shows **Reconnect required**. Open it and click **Reconnect**. Linked repositories stay linked
- Removing the provider also revokes its tokens at OpenAI or xAI

---

## What's next

Connect your Git host and link a repository:

- [GitLab](/docs/gitlab)
- [Forgejo](/docs/forgejo)
- [GitHub](/docs/github)
