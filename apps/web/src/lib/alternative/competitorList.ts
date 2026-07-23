export type FeatureRow = {
    label: string;
    competitor: string;
    proval: string;
};

export type CapabilityRow = {
    label: string;
    competitor: boolean;
    proval: boolean;
};

export type Competitor = {
    slug: string;
    name: string;
    targetKeyword: string;
    title: string;
    description: string;
    heroLead: string;
    intro: string;
    verdict: string;
    ogImagePath: string;
    featureRowList: FeatureRow[];
    capabilityRowList: CapabilityRow[];
};

export const COMPETITOR_LIST: Competitor[] = [
    {
        slug: "coderabbit",
        name: "CodeRabbit",
        targetKeyword: "coderabbit alternative",
        title: "CodeRabbit Alternative | Proval",
        description: "CodeRabbit alternative for self-hosted AI code review, local LLMs, Forgejo, and open source.",
        heroLead: "Looking for a CodeRabbit alternative?",
        intro: "CodeRabbit is a strong SaaS review bot with deep GitHub and GitLab coverage. Teams that need self-host without an Enterprise deal, Forgejo support, or a local model endpoint often look for a CodeRabbit alternative they can run on their own network.",
        verdict:
            "Choose Proval when you want open source self-hosted review with Your Own Model. Stay with CodeRabbit when you prefer a managed SaaS suite with seat based pricing and IDE autofix workflows.",
        ogImagePath: "/og-coderabbit.png",
        featureRowList: [
            { label: "Pricing", competitor: "From ~$24/user/mo (per seat)", proval: "Free + Your Own Model" },
            {
                label: "Deployment",
                competitor: "SaaS (self-host is Enterprise only)",
                proval: "Self-hosted",
            },
            {
                label: "Works with",
                competitor: "GitHub, GitLab, Bitbucket, Azure DevOps (no Forgejo)",
                proval: "GitHub, GitLab, Forgejo",
            },
            {
                label: "Your own model or API",
                competitor: "Managed stack (no local model on Pro)",
                proval: "Your Own API, Your Own Model",
            },
            { label: "License", competitor: "Closed product", proval: "Open Source" },
            {
                label: "Focus",
                competitor: "Deep review, IDE, autofix (SaaS-first)",
                proval: "Lightweight agent loop, self-hosted, privacy-first",
            },
        ],
        capabilityRowList: [
            { label: "Pull Request Review", competitor: true, proval: true },
            { label: "Pull Request Reply", competitor: true, proval: true },
            { label: "Issue Reply", competitor: true, proval: true },
            { label: "Inline Review", competitor: true, proval: true },
            { label: "PR Summary", competitor: true, proval: true },
            { label: "GitHub support", competitor: true, proval: true },
            { label: "GitLab support", competitor: true, proval: true },
            { label: "Forgejo support", competitor: false, proval: true },
            { label: "Self-hosted without Enterprise", competitor: false, proval: true },
            { label: "Local Model support", competitor: false, proval: true },
            { label: "Open Source", competitor: false, proval: true },
            { label: "Bitbucket / Azure DevOps", competitor: true, proval: false },
        ],
    },
    {
        slug: "qodo",
        name: "Qodo",
        targetKeyword: "qodo alternative",
        title: "Qodo Alternative | Proval",
        description: "Qodo alternative for self-hosted AI PR review, Forgejo, and Your Own Model without seat lock-in.",
        heroLead: "Looking for a Qodo alternative?",
        intro: "Qodo (and the related PR-Agent open source line) covers review, tests, and IDE workflows as a broader platform. A Qodo alternative like Proval fits teams that want one lightweight self-hosted review agent with clear webhook driven policy instead of a full suite and metered credits.",
        verdict:
            "Pick Proval for a single open source review service you deploy yourself. Prefer Qodo when you need the wider platform (tests, IDE) and are fine with SaaS or Enterprise on-prem packaging.",
        ogImagePath: "/og-qodo.png",
        featureRowList: [
            {
                label: "Pricing",
                competitor: "Teams ~$30/user + credits (usage metered)",
                proval: "Free + Your Own Model",
            },
            {
                label: "Deployment",
                competitor: "SaaS (on-prem is Enterprise; PR-Agent is separate OSS)",
                proval: "Self-hosted",
            },
            {
                label: "Works with",
                competitor: "GitHub, GitLab, Bitbucket, Azure DevOps (Forgejo via PR-Agent only)",
                proval: "GitHub, GitLab, Forgejo",
            },
            {
                label: "Your own model or API",
                competitor: "Managed SaaS (BYOK is Enterprise; PR-Agent needs your keys)",
                proval: "Your Own API, Your Own Model",
            },
            {
                label: "License",
                competitor: "Qodo SaaS closed (PR-Agent is separate OSS)",
                proval: "Open Source",
            },
            {
                label: "Focus",
                competitor: "Review, tests, IDE (platform suite)",
                proval: "Lightweight agent loop, self-hosted, privacy-first",
            },
        ],
        capabilityRowList: [
            { label: "Pull Request Review", competitor: true, proval: true },
            { label: "Pull Request Reply", competitor: true, proval: true },
            { label: "Issue Reply", competitor: false, proval: true },
            { label: "Inline Review", competitor: true, proval: true },
            { label: "PR Summary", competitor: true, proval: true },
            { label: "GitHub support", competitor: true, proval: true },
            { label: "GitLab support", competitor: true, proval: true },
            { label: "Open Source", competitor: false, proval: true },
            { label: "Self-hosted without Enterprise", competitor: false, proval: true },
            { label: "Local Model support", competitor: false, proval: true },
            { label: "Forgejo support", competitor: false, proval: true },
            { label: "Bitbucket / Azure DevOps", competitor: true, proval: false },
        ],
    },
    {
        slug: "greptile",
        name: "Greptile",
        targetKeyword: "greptile alternative",
        title: "Greptile Alternative | Proval",
        description:
            "Greptile alternative for predictable cost, self-hosted privacy, Forgejo, and local LLM code review.",
        heroLead: "Looking for a Greptile alternative?",
        intro: "Greptile leans on a heavy repo graph index and seat plus overage pricing. Teams that want predictable cost, Forgejo, or a local LLM path often search for a Greptile alternative that stays lightweight and fully self-hosted without a custom license deal.",
        verdict:
            "Use Proval when privacy, open source, and Your Own Model matter more than a managed graph index. Keep Greptile when you want their SaaS indexing depth and are comfortable with seat plus review overage pricing.",
        ogImagePath: "/og-greptile.png",
        featureRowList: [
            {
                label: "Pricing",
                competitor: "$30/seat + $1/extra review (per author overage)",
                proval: "Free + Your Own Model",
            },
            {
                label: "Deployment",
                competitor: "SaaS (self-host needs a license deal)",
                proval: "Self-hosted",
            },
            {
                label: "Works with",
                competitor: "GitHub, GitLab (no Forgejo)",
                proval: "GitHub, GitLab, Forgejo",
            },
            {
                label: "Your own model or API",
                competitor: "Managed cloud (customer LLM on licensed self-host)",
                proval: "Your Own API, Your Own Model",
            },
            { label: "License", competitor: "Commercial (not open source)", proval: "Open Source" },
            {
                label: "Focus",
                competitor: "Repo graph index, TREX (heavier stack)",
                proval: "Lightweight agent loop, self-hosted, privacy-first",
            },
        ],
        capabilityRowList: [
            { label: "Pull Request Review", competitor: true, proval: true },
            { label: "Pull Request Reply", competitor: true, proval: true },
            { label: "Issue Reply", competitor: false, proval: true },
            { label: "Inline Review", competitor: true, proval: true },
            { label: "PR Summary", competitor: true, proval: true },
            { label: "GitHub support", competitor: true, proval: true },
            { label: "GitLab support", competitor: true, proval: true },
            { label: "Self-hosted", competitor: true, proval: true },
            { label: "Local Model support", competitor: true, proval: true },
            { label: "Forgejo support", competitor: false, proval: true },
            { label: "Open Source", competitor: false, proval: true },
            { label: "Self-hosted without a license deal", competitor: false, proval: true },
        ],
    },
    {
        slug: "graphite",
        name: "Graphite",
        targetKeyword: "graphite alternative",
        title: "Graphite Alternative | Proval",
        description: "Graphite Agent alternative for self-hosted AI review outside GitHub-only stacked PR workflows.",
        heroLead: "Looking for a Graphite alternative?",
        intro: "Graphite combines stacked PRs, a merge queue, and Graphite Agent on GitHub. If you mainly need AI review on GitLab or Forgejo, or you refuse GitHub-only lock-in, Proval is a Graphite Agent alternative focused on self-hosted review rather than stacked PR UX.",
        verdict:
            "Choose Proval for multi-provider self-hosted review with Your Own Model. Stay with Graphite when stacked PRs and the Graphite inbox on GitHub are the product you want.",
        ogImagePath: "/og-graphite.png",
        featureRowList: [
            {
                label: "Pricing",
                competitor: "Starter ~$20, Team ~$40/user (AI unlimited on Team)",
                proval: "Free + Your Own Model",
            },
            {
                label: "Deployment",
                competitor: "SaaS only (no self-host)",
                proval: "Self-hosted",
            },
            {
                label: "Works with",
                competitor: "GitHub only (no GitLab or Forgejo)",
                proval: "GitHub, GitLab, Forgejo",
            },
            {
                label: "Your own model or API",
                competitor: "Graphite Agent (managed)",
                proval: "Your Own API, Your Own Model",
            },
            { label: "License", competitor: "Commercial (not open source)", proval: "Open Source" },
            {
                label: "Focus",
                competitor: "Stacked PRs + merge queue (workflow lock-in)",
                proval: "Lightweight agent loop, self-hosted, privacy-first",
            },
        ],
        capabilityRowList: [
            { label: "Pull Request Review", competitor: true, proval: true },
            { label: "Pull Request Reply", competitor: true, proval: true },
            { label: "Issue Reply", competitor: false, proval: true },
            { label: "Inline Review", competitor: true, proval: true },
            { label: "PR Summary", competitor: true, proval: true },
            { label: "GitHub support", competitor: true, proval: true },
            { label: "GitLab support", competitor: false, proval: true },
            { label: "Forgejo support", competitor: false, proval: true },
            { label: "Self-hosted without Enterprise", competitor: false, proval: true },
            { label: "Local Model support", competitor: false, proval: true },
            { label: "Open Source", competitor: false, proval: true },
            { label: "Graphite PR inbox UI", competitor: true, proval: false },
        ],
    },
];
