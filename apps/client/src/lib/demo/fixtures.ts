import type {
    AccessResponse,
    Activity,
    ActivitySummaryResponse,
    GitHubAppResponse,
    GitHubInstallationResponse,
    GitProviderRepositoryListResponse,
    ModelProviderModelListResponse,
    ModelProviderResponse,
    Pagination,
    RepositoryResponse,
} from "@proval/types";

function minutesAgo(minutes: number): Date {
    return new Date(Date.now() - minutes * 60 * 1000);
}

export const modelProviderList: ModelProviderResponse[] = [
    {
        id: 1,
        provider: "openai",
        label: "Local llama.cpp",
        baseUrl: "http://localhost:11434/v1",
        createdAt: minutesAgo(60 * 24 * 14),
        updatedAt: minutesAgo(60 * 24 * 2),
    },
    {
        id: 2,
        provider: "openai",
        label: "External LLM API",
        baseUrl: "https://api.openrouter.ai/api/v1",
        createdAt: minutesAgo(60 * 24 * 7),
        updatedAt: minutesAgo(60 * 24),
    },
];

export const accessList: AccessResponse[] = [
    {
        id: 1,
        provider: "gitlab",
        name: "Dowonseo GitLab",
        baseUrl: "https://gitlab.dowonseo.dev",
        createdAt: minutesAgo(60 * 24 * 10),
        updatedAt: minutesAgo(60 * 24 * 3),
    },
];

export const githubAppList: GitHubAppResponse[] = [
    {
        id: 1,
        appId: 123456,
        slug: "proval-demo",
        createdAt: minutesAgo(60 * 24 * 8),
        updatedAt: minutesAgo(60 * 24),
    },
];

export const githubInstallationList: GitHubInstallationResponse[] = [
    {
        id: 1,
        installationId: 987654,
        appId: 1,
        accountName: "dowonseo",
        accountType: "Organization",
        createdAt: minutesAgo(60 * 24 * 8),
        updatedAt: minutesAgo(60 * 24),
    },
];

export const repositoryList: RepositoryResponse[] = [
    {
        id: 1,
        path: "dowonseo/web-auth",
        description: "Login, sessions, and token handling",
        provider: "gitlab",
        language: "English",
        gitProviderAccessId: 1,
        gitProviderRepositoryId: 101,
        githubInstallationId: null,
        githubRepositoryId: null,
        reviewOnPullRequestOpen: true,
        inlineReview: true,
        replyToPullRequestComment: "mentioned_only",
        commentOnIssueOpen: true,
        replyToIssueComment: "all",
        modelProviderId: 1,
        modelName: "qwen3.6-35b-a3b",
        createdAt: minutesAgo(60 * 24 * 9),
        updatedAt: minutesAgo(60 * 24),
        lastUsedAt: minutesAgo(12),
    },
    {
        id: 2,
        path: "dowonseo/web-app",
        description: "Main web application",
        provider: "github",
        language: "English",
        gitProviderAccessId: null,
        gitProviderRepositoryId: null,
        githubInstallationId: 1,
        githubRepositoryId: 201,
        reviewOnPullRequestOpen: true,
        inlineReview: true,
        replyToPullRequestComment: "all",
        commentOnIssueOpen: false,
        replyToIssueComment: "off",
        modelProviderId: 2,
        modelName: "anthropic/claude-sonnet-5",
        createdAt: minutesAgo(60 * 24 * 6),
        updatedAt: minutesAgo(60 * 12),
        lastUsedAt: minutesAgo(45),
    },
    {
        id: 3,
        path: "somedude/expense-tracker",
        description: "Personal side project — expense logging app",
        provider: "forgejo",
        language: "English",
        gitProviderAccessId: 1,
        gitProviderRepositoryId: 301,
        githubInstallationId: null,
        githubRepositoryId: null,
        reviewOnPullRequestOpen: true,
        inlineReview: false,
        replyToPullRequestComment: "off",
        commentOnIssueOpen: true,
        replyToIssueComment: "mentioned_only",
        modelProviderId: 1,
        modelName: "qwen3.6-35b-a3b",
        createdAt: minutesAgo(60 * 24 * 4),
        updatedAt: minutesAgo(60 * 6),
        lastUsedAt: minutesAgo(180),
    },
];

export const activityList: Activity[] = [
    {
        id: 1,
        repositoryId: 2,
        repositoryPath: "dowonseo/web-app",
        provider: "github",
        modelProviderId: 2,
        modelName: "anthropic/claude-sonnet-5",
        type: "pr_review",
        status: "started",
        targetIid: 142,
        inputToken: null,
        cachedInputToken: null,
        outputToken: null,
        errorMessage: null,
        completedAt: null,
        createdAt: minutesAgo(3),
        updatedAt: minutesAgo(3),
    },
    {
        id: 2,
        repositoryId: 1,
        repositoryPath: "dowonseo/web-auth",
        provider: "gitlab",
        modelProviderId: 1,
        modelName: "qwen3.6-35b-a3b",
        type: "pr_review",
        status: "started",
        targetIid: 87,
        inputToken: null,
        cachedInputToken: null,
        outputToken: null,
        errorMessage: null,
        completedAt: null,
        createdAt: minutesAgo(8),
        updatedAt: minutesAgo(8),
    },
    {
        id: 3,
        repositoryId: 2,
        repositoryPath: "dowonseo/web-app",
        provider: "github",
        modelProviderId: 2,
        modelName: "anthropic/claude-sonnet-5",
        type: "pr_review",
        status: "completed",
        targetIid: 141,
        inputToken: 18420,
        cachedInputToken: 3200,
        outputToken: 2104,
        errorMessage: null,
        completedAt: minutesAgo(45),
        createdAt: minutesAgo(52),
        updatedAt: minutesAgo(45),
    },
    {
        id: 4,
        repositoryId: 1,
        repositoryPath: "dowonseo/web-auth",
        provider: "gitlab",
        modelProviderId: 1,
        modelName: "qwen3.6-35b-a3b",
        type: "pr_review",
        status: "completed",
        targetIid: 86,
        inputToken: 22100,
        cachedInputToken: 0,
        outputToken: 1890,
        errorMessage: null,
        completedAt: minutesAgo(90),
        createdAt: minutesAgo(98),
        updatedAt: minutesAgo(90),
    },
    {
        id: 5,
        repositoryId: 3,
        repositoryPath: "somedude/expense-tracker",
        provider: "forgejo",
        modelProviderId: 1,
        modelName: "qwen3.6-35b-a3b",
        type: "pr_review",
        status: "failed",
        targetIid: 34,
        inputToken: 4200,
        cachedInputToken: 0,
        outputToken: 0,
        errorMessage: "LLM request timed out after 120s",
        completedAt: minutesAgo(120),
        createdAt: minutesAgo(125),
        updatedAt: minutesAgo(120),
    },
    {
        id: 6,
        repositoryId: 2,
        repositoryPath: "dowonseo/web-app",
        provider: "github",
        modelProviderId: 2,
        modelName: "anthropic/claude-sonnet-5",
        type: "pr_reply",
        status: "completed",
        targetIid: 140,
        inputToken: 3100,
        cachedInputToken: 800,
        outputToken: 420,
        errorMessage: null,
        completedAt: minutesAgo(200),
        createdAt: minutesAgo(205),
        updatedAt: minutesAgo(200),
    },
    {
        id: 7,
        repositoryId: 1,
        repositoryPath: "dowonseo/web-auth",
        provider: "gitlab",
        modelProviderId: 1,
        modelName: "qwen3.6-35b-a3b",
        type: "issue_reply",
        status: "completed",
        targetIid: 52,
        inputToken: 1800,
        cachedInputToken: 0,
        outputToken: 310,
        errorMessage: null,
        completedAt: minutesAgo(300),
        createdAt: minutesAgo(305),
        updatedAt: minutesAgo(300),
    },
    {
        id: 8,
        repositoryId: 2,
        repositoryPath: "dowonseo/web-app",
        provider: "github",
        modelProviderId: 2,
        modelName: "anthropic/claude-sonnet-5",
        type: "pr_review",
        status: "failed",
        targetIid: 139,
        inputToken: 8900,
        cachedInputToken: 0,
        outputToken: 0,
        errorMessage: "Git provider API rate limit exceeded",
        completedAt: minutesAgo(400),
        createdAt: minutesAgo(410),
        updatedAt: minutesAgo(400),
    },
    {
        id: 9,
        repositoryId: 1,
        repositoryPath: "dowonseo/web-auth",
        provider: "gitlab",
        modelProviderId: 1,
        modelName: "qwen3.6-35b-a3b",
        type: "pr_review",
        status: "completed",
        targetIid: 85,
        inputToken: 15600,
        cachedInputToken: 2100,
        outputToken: 1650,
        errorMessage: null,
        completedAt: minutesAgo(500),
        createdAt: minutesAgo(510),
        updatedAt: minutesAgo(500),
    },
    {
        id: 10,
        repositoryId: 3,
        repositoryPath: "somedude/expense-tracker",
        provider: "forgejo",
        modelProviderId: 1,
        modelName: "qwen3.6-35b-a3b",
        type: "issue_open",
        status: "completed",
        targetIid: 12,
        inputToken: 2400,
        cachedInputToken: 0,
        outputToken: 580,
        errorMessage: null,
        completedAt: minutesAgo(600),
        createdAt: minutesAgo(610),
        updatedAt: minutesAgo(600),
    },
    {
        id: 11,
        repositoryId: 2,
        repositoryPath: "dowonseo/web-app",
        provider: "github",
        modelProviderId: 2,
        modelName: "anthropic/claude-sonnet-5",
        type: "pr_review",
        status: "completed",
        targetIid: 138,
        inputToken: 19800,
        cachedInputToken: 4500,
        outputToken: 2200,
        errorMessage: null,
        completedAt: minutesAgo(700),
        createdAt: minutesAgo(715),
        updatedAt: minutesAgo(700),
    },
    {
        id: 12,
        repositoryId: 1,
        repositoryPath: "dowonseo/web-auth",
        provider: "gitlab",
        modelProviderId: 1,
        modelName: "qwen3.6-35b-a3b",
        type: "pr_reply",
        status: "completed",
        targetIid: 84,
        inputToken: 2200,
        cachedInputToken: 0,
        outputToken: 380,
        errorMessage: null,
        completedAt: minutesAgo(800),
        createdAt: minutesAgo(810),
        updatedAt: minutesAgo(800),
    },
];

export const activitySummary: ActivitySummaryResponse = {
    last24Hours: {
        totalActivity: 9,
        errors: 2,
        reviews: 5,
        replies: 2,
    },
    inProgress: activityList.filter((a) => a.status === "started"),
};

const gitlabRepoSelectList: GitProviderRepositoryListResponse[] = [
    {
        id: 101,
        name: "web-auth",
        fullName: "dowonseo/web-auth",
        description: "Login, sessions, and token handling",
        defaultBranch: "main",
        alreadyConnected: true,
    },
    {
        id: 102,
        name: "api-gateway",
        fullName: "dowonseo/api-gateway",
        description: "Edge routing",
        defaultBranch: "main",
        alreadyConnected: false,
    },
    {
        id: 103,
        name: "billing",
        fullName: "dowonseo/billing",
        description: "Billing and invoices",
        defaultBranch: "main",
        alreadyConnected: false,
    },
    {
        id: 104,
        name: "worker",
        fullName: "dowonseo/worker",
        description: "Background jobs",
        defaultBranch: "main",
        alreadyConnected: false,
    },
];

const forgejoRepoSelectList: GitProviderRepositoryListResponse[] = [
    {
        id: 301,
        name: "expense-tracker",
        fullName: "somedude/expense-tracker",
        description: "Personal side project — expense logging app",
        defaultBranch: "main",
        alreadyConnected: true,
    },
    {
        id: 302,
        name: "worker",
        fullName: "dowonseo/worker",
        description: "Background jobs",
        defaultBranch: "main",
        alreadyConnected: false,
    },
];

const githubRepoSelectList: GitProviderRepositoryListResponse[] = [
    {
        id: 201,
        name: "web-app",
        fullName: "dowonseo/web-app",
        description: "Main web application",
        defaultBranch: "main",
        alreadyConnected: true,
    },
    {
        id: 202,
        name: "monitor",
        fullName: "dowonseo/monitor",
        description: "Metrics and alerts",
        defaultBranch: "main",
        alreadyConnected: false,
    },
    {
        id: 203,
        name: "playground",
        fullName: "somedude/playground",
        description: "Experiments",
        defaultBranch: "main",
        alreadyConnected: false,
    },
    {
        id: 204,
        name: "homelab",
        fullName: "somedude/homelab",
        description: "Home server configs",
        defaultBranch: "main",
        alreadyConnected: false,
    },
];

const modelListByProviderId: Record<number, ModelProviderModelListResponse> = {
    1: {
        models: [{ id: "qwen3.6-35b-a3b" }, { id: "gemma-4-12b" }],
        source: "openai_compatible",
    },
    2: {
        models: [{ id: "anthropic/claude-sonnet-5" }, { id: "anthropic/claude-opus-4-7" }],
        source: "openai_compatible",
    },
};

export function getModelProviderById(id: number): ModelProviderResponse | undefined {
    return modelProviderList.find((m) => m.id === id);
}

export function getRepositoryById(id: number): RepositoryResponse | undefined {
    return repositoryList.find((r) => r.id === id);
}

export function getAccessById(id: number): AccessResponse | undefined {
    return accessList.find((a) => a.id === id);
}

export function getActivityById(id: number): Activity | undefined {
    return activityList.find((a) => a.id === id);
}

export function getGitHubInstallationById(id: number): GitHubInstallationResponse | undefined {
    return githubInstallationList.find((i) => i.id === id);
}

export function getAccessRepositoryList(accessId: number): GitProviderRepositoryListResponse[] {
    if (accessId === 1) {
        return [...gitlabRepoSelectList, ...forgejoRepoSelectList];
    }
    return [];
}

export function getGitHubRepositoryList(): GitProviderRepositoryListResponse[] {
    return githubRepoSelectList;
}

export function getModelListByProviderId(providerId: number): ModelProviderModelListResponse {
    return modelListByProviderId[providerId] ?? { models: [], source: "unavailable" };
}

export function paginateActivities(page: number, limit: number): Pagination<Activity> {
    const sorted = [...activityList].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const total = sorted.length;
    const start = (page - 1) * limit;
    const itemList = sorted.slice(start, start + limit);
    return { itemList, page, limit, total };
}
