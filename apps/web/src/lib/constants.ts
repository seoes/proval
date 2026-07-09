export const GITHUB_URL = "https://github.com/seoes/proval";

export const DEMO_URL = "https://demo.proval.app";

export const SITE_DESCRIPTION =
    "Self-hosted, privacy-first AI code review for GitLab, Forgejo, and GitHub. Bring your own LLM.";

export const BENEFITS = [
    {
        title: "Stays on your network",
        body: "Reviews and repo context go to the LLM endpoint you configure, not a third-party review SaaS.",
    },
    {
        title: "Bring your own model",
        body: "Use an OpenAI-compatible endpoint, including local or on-prem model servers that your team already operates.",
    },
    {
        title: "GitLab, Forgejo, GitHub",
        body: "Built for teams that do not live entirely inside GitHub, with predictable webhook-driven automation.",
    },
    {
        title: "Set it and forget it",
        body: "Hook up webhooks once. Proval reviews merge requests and replies in threads when your policy allows.",
    },
] as const;
