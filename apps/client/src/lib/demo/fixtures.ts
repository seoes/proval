import type {
    AccessResponse,
    Activity,
    ActivitySummaryResponse,
    DashboardRange,
    GitHubAppResponse,
    GitHubInstallationResponse,
    GitProviderRepositoryListResponse,
    ModelProviderModelListResponse,
    ModelProviderResponse,
    Pagination,
    RepositoryResponse,
    TokenBreakdownItem,
    TokenSeriesPoint,
} from "@proval/types";

function minutesAgo(minutes: number): Date {
    return new Date(Date.now() - minutes * 60 * 1000);
}

function daysAgo(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

const MODEL_QWEN = "qwen/qwen3.6-35b-a3b";
const MODEL_GEMMA = "google/gemma-4-12b";
const MODEL_SONNET = "anthropic/claude-sonnet-5";

/** Deterministic PRNG so demo charts stay stable across reloads. */
function mulberry32(seed: number): () => number {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function randInt(rng: () => number, min: number, max: number): number {
    return Math.floor(rng() * (max - min + 1)) + min;
}

export const modelProviderList: ModelProviderResponse[] = [
    {
        id: 1,
        provider: "openai",
        label: "Local llama.cpp",
        baseUrl: "http://localhost:11434/v1",
        createdAt: daysAgo(210),
        updatedAt: minutesAgo(60 * 24 * 2),
    },
    {
        id: 2,
        provider: "openai",
        label: "External LLM API",
        baseUrl: "https://api.openrouter.ai/api/v1",
        createdAt: daysAgo(190),
        updatedAt: minutesAgo(60 * 24),
    },
];

export const accessList: AccessResponse[] = [
    {
        id: 1,
        provider: "gitlab",
        name: "Dowonseo GitLab",
        baseUrl: "https://gitlab.dowonseo.dev",
        createdAt: daysAgo(205),
        updatedAt: minutesAgo(60 * 24 * 3),
    },
];

export const githubAppList: GitHubAppResponse[] = [
    {
        id: 1,
        appId: 123456,
        slug: "proval-demo",
        createdAt: daysAgo(185),
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
        createdAt: daysAgo(185),
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
        modelName: MODEL_QWEN,
        createdAt: daysAgo(200),
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
        modelName: MODEL_SONNET,
        createdAt: daysAgo(180),
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
        modelName: MODEL_QWEN,
        createdAt: daysAgo(120),
        updatedAt: minutesAgo(60 * 6),
        lastUsedAt: minutesAgo(180),
    },
];

type DemoRepo = {
    id: number;
    path: string;
    provider: Activity["provider"];
    modelProviderId: number;
    modelName: string;
    weight: number;
};

const DEMO_REPOS: DemoRepo[] = [
    {
        id: 1,
        path: "dowonseo/web-auth",
        provider: "gitlab",
        modelProviderId: 1,
        modelName: MODEL_QWEN,
        weight: 0.35,
    },
    {
        id: 2,
        path: "dowonseo/web-app",
        provider: "github",
        modelProviderId: 2,
        modelName: MODEL_SONNET,
        weight: 0.5,
    },
    {
        id: 3,
        path: "somedude/expense-tracker",
        provider: "forgejo",
        modelProviderId: 1,
        modelName: MODEL_QWEN,
        weight: 0.15,
    },
];

function pickRepo(rng: () => number): DemoRepo {
    const roll = rng();
    let cumulative = 0;
    for (const repo of DEMO_REPOS) {
        cumulative += repo.weight;
        if (roll < cumulative) return repo;
    }
    return DEMO_REPOS[DEMO_REPOS.length - 1];
}

function pickModelName(repo: DemoRepo, rng: () => number): string {
    if (repo.modelProviderId === 1 && rng() < 0.18) return MODEL_GEMMA;
    return repo.modelName;
}

function tokenProfile(
    type: Activity["type"],
    rng: () => number,
): { inputToken: number; cachedInputToken: number; outputToken: number } {
    // Ranges calibrated from local.db completed activities + operator feel:
    // pr_review input ~200k (small) / ~700k (large); output ~20k–50k
    // reply input ~100k; output ~5k–10k (real avg lower; demo leans to felt range)
    if (type === "pr_review") {
        const roll = rng();
        let inputToken: number;
        if (roll < 0.35) inputToken = randInt(rng, 170000, 280000);
        else if (roll < 0.8) inputToken = randInt(rng, 280000, 520000);
        else if (roll < 0.95) inputToken = randInt(rng, 520000, 720000);
        else inputToken = randInt(rng, 900000, 1900000); // rare heavy reviews
        const cacheRatio = 0.55 + rng() * 0.3; // ~55–85%, matching real cache hit rates
        const cachedInputToken = Math.floor(inputToken * cacheRatio);
        const outputToken =
            roll < 0.95 ? randInt(rng, 16000, 52000) : randInt(rng, 80000, 180000);
        return { inputToken, cachedInputToken, outputToken };
    }

    if (type === "issue_open") {
        const inputToken = randInt(rng, 75000, 220000);
        const cachedInputToken = Math.floor(inputToken * (0.5 + rng() * 0.3));
        return { inputToken, cachedInputToken, outputToken: randInt(rng, 2000, 4500) };
    }

    // pr_reply / issue_reply
    const roll = rng();
    let inputToken: number;
    if (type === "issue_reply") {
        inputToken =
            roll < 0.7 ? randInt(rng, 20000, 70000) : randInt(rng, 70000, 120000);
    } else if (roll < 0.55) {
        inputToken = randInt(rng, 35000, 110000);
    } else if (roll < 0.9) {
        inputToken = randInt(rng, 110000, 220000);
    } else {
        inputToken = randInt(rng, 250000, 450000); // long thread / large context
    }
    const cachedInputToken = Math.floor(inputToken * (0.55 + rng() * 0.3));
    const outputToken =
        roll < 0.75 ? randInt(rng, 4500, 10000) : randInt(rng, 1500, 4500);
    return { inputToken, cachedInputToken, outputToken };
}

function pickType(rng: () => number): Activity["type"] {
    const roll = rng();
    if (roll < 0.62) return "pr_review";
    if (roll < 0.82) return "pr_reply";
    if (roll < 0.92) return "issue_reply";
    return "issue_open";
}

/** Recent showcase rows for the activity feed (last ~14h). */
const recentActivityList: Activity[] = [
    {
        id: 1,
        repositoryId: 2,
        repositoryPath: "dowonseo/web-app",
        provider: "github",
        modelProviderId: 2,
        modelName: MODEL_SONNET,
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
        modelName: MODEL_QWEN,
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
        modelName: MODEL_SONNET,
        type: "pr_review",
        status: "completed",
        targetIid: 141,
        inputToken: 486200,
        cachedInputToken: 361400,
        outputToken: 38400,
        errorMessage: null,
        completedAt: minutesAgo(45),
        createdAt: minutesAgo(58),
        updatedAt: minutesAgo(45),
    },
    {
        id: 4,
        repositoryId: 1,
        repositoryPath: "dowonseo/web-auth",
        provider: "gitlab",
        modelProviderId: 1,
        modelName: MODEL_QWEN,
        type: "pr_review",
        status: "completed",
        targetIid: 86,
        inputToken: 218500,
        cachedInputToken: 0,
        outputToken: 24100,
        errorMessage: null,
        completedAt: minutesAgo(90),
        createdAt: minutesAgo(102),
        updatedAt: minutesAgo(90),
    },
    {
        id: 5,
        repositoryId: 3,
        repositoryPath: "somedude/expense-tracker",
        provider: "forgejo",
        modelProviderId: 1,
        modelName: MODEL_QWEN,
        type: "pr_review",
        status: "failed",
        targetIid: 34,
        inputToken: 142000,
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
        modelName: MODEL_SONNET,
        type: "pr_reply",
        status: "completed",
        targetIid: 140,
        inputToken: 98400,
        cachedInputToken: 71200,
        outputToken: 6400,
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
        modelName: MODEL_GEMMA,
        type: "issue_reply",
        status: "completed",
        targetIid: 52,
        inputToken: 42800,
        cachedInputToken: 28600,
        outputToken: 5200,
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
        modelName: MODEL_SONNET,
        type: "pr_review",
        status: "failed",
        targetIid: 139,
        inputToken: 268000,
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
        modelName: MODEL_QWEN,
        type: "pr_review",
        status: "completed",
        targetIid: 85,
        inputToken: 334800,
        cachedInputToken: 248200,
        outputToken: 31200,
        errorMessage: null,
        completedAt: minutesAgo(500),
        createdAt: minutesAgo(515),
        updatedAt: minutesAgo(500),
    },
    {
        id: 10,
        repositoryId: 3,
        repositoryPath: "somedude/expense-tracker",
        provider: "forgejo",
        modelProviderId: 1,
        modelName: MODEL_QWEN,
        type: "issue_open",
        status: "completed",
        targetIid: 12,
        inputToken: 128400,
        cachedInputToken: 84200,
        outputToken: 3100,
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
        modelName: MODEL_SONNET,
        type: "pr_review",
        status: "completed",
        targetIid: 138,
        inputToken: 682500,
        cachedInputToken: 541200,
        outputToken: 47800,
        errorMessage: null,
        completedAt: minutesAgo(700),
        createdAt: minutesAgo(720),
        updatedAt: minutesAgo(700),
    },
    {
        id: 12,
        repositoryId: 1,
        repositoryPath: "dowonseo/web-auth",
        provider: "gitlab",
        modelProviderId: 1,
        modelName: MODEL_QWEN,
        type: "pr_reply",
        status: "completed",
        targetIid: 84,
        inputToken: 112600,
        cachedInputToken: 89400,
        outputToken: 7800,
        errorMessage: null,
        completedAt: minutesAgo(800),
        createdAt: minutesAgo(810),
        updatedAt: minutesAgo(800),
    },
];

/**
 * Year-to-date history so 30d / year charts look like a real small team
 * (~2–4M tokens/month, weekday-heavy). Starts Jan 1 or 90 days ago, whichever is earlier.
 */
function buildHistoricalActivities(): Activity[] {
    const rng = mulberry32(20260710);
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 2);
    const threeMonthsAgo = daysAgo(92);
    const start = yearStart < threeMonthsAgo ? yearStart : threeMonthsAgo;

    const activities: Activity[] = [];
    let nextId = 100;
    const targetIidByRepo = new Map<number, number>([
        [1, 40],
        [2, 90],
        [3, 8],
    ]);

    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    while (cursor < endDay) {
        const dayOfWeek = cursor.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        // Ramp up slightly toward recent months (adoption growth).
        const monthsFromStart =
            (cursor.getFullYear() - start.getFullYear()) * 12 + (cursor.getMonth() - start.getMonth());
        const growth = 1 + Math.min(monthsFromStart, 6) * 0.08;
        const baseCount = isWeekend ? randInt(rng, 0, 2) : randInt(rng, 3, 7);
        const count = Math.max(0, Math.round(baseCount * growth));

        for (let i = 0; i < count; i++) {
            const repo = pickRepo(rng);
            const type = pickType(rng);
            const failed = rng() < 0.04;
            const hour = isWeekend ? randInt(rng, 10, 20) : randInt(rng, 8, 22);
            const minute = randInt(rng, 0, 59);
            const completedAt = new Date(
                cursor.getFullYear(),
                cursor.getMonth(),
                cursor.getDate(),
                hour,
                minute,
            );
            const durationMin = type === "pr_review" ? randInt(rng, 4, 18) : randInt(rng, 1, 6);
            const createdAt = new Date(completedAt.getTime() - durationMin * 60 * 1000);
            const tokens = failed
                ? {
                      inputToken: randInt(rng, 80000, 320000),
                      cachedInputToken: 0,
                      outputToken: 0,
                  }
                : tokenProfile(type, rng);
            const nextIid = (targetIidByRepo.get(repo.id) ?? 1) + 1;
            targetIidByRepo.set(repo.id, nextIid);

            activities.push({
                id: nextId++,
                repositoryId: repo.id,
                repositoryPath: repo.path,
                provider: repo.provider,
                modelProviderId: repo.modelProviderId,
                modelName: pickModelName(repo, rng),
                type,
                status: failed ? "failed" : "completed",
                targetIid: nextIid,
                ...tokens,
                errorMessage: failed
                    ? rng() < 0.5
                        ? "LLM request timed out after 120s"
                        : "Git provider API rate limit exceeded"
                    : null,
                completedAt,
                createdAt,
                updatedAt: completedAt,
            });
        }

        cursor.setDate(cursor.getDate() + 1);
    }

    return activities;
}

export const activityList: Activity[] = [...recentActivityList, ...buildHistoricalActivities()];

const DASHBOARD_RANGES: DashboardRange[] = ["24h", "7d", "30d", "mtd", "year"];

export function parseDashboardRange(value: string | null | undefined): DashboardRange {
    if (value && (DASHBOARD_RANGES as string[]).includes(value)) {
        return value as DashboardRange;
    }
    return "24h";
}

function resolveSince(range: DashboardRange, now: Date): { since: Date; bucket: "hour" | "day" | "month" } {
    switch (range) {
        case "24h":
            return { since: new Date(now.getTime() - 24 * 60 * 60 * 1000), bucket: "hour" };
        case "7d":
            return { since: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), bucket: "day" };
        case "30d":
            return { since: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), bucket: "day" };
        case "mtd":
            return { since: new Date(now.getFullYear(), now.getMonth(), 1), bucket: "day" };
        case "year":
            return { since: new Date(now.getFullYear(), 0, 1), bucket: "month" };
    }
}

function startOfHour(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours());
}

function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function bucketKey(date: Date, bucket: "hour" | "day" | "month"): number {
    if (bucket === "hour") return startOfHour(date).getTime();
    if (bucket === "day") return startOfDay(date).getTime();
    return startOfMonth(date).getTime();
}

function buildBucketStarts(since: Date, bucket: "hour" | "day" | "month", now: Date): Date[] {
    const starts: Date[] = [];
    if (bucket === "hour") {
        let cursor = startOfHour(since);
        const end = startOfHour(now);
        while (cursor <= end) {
            starts.push(new Date(cursor));
            cursor = new Date(cursor.getTime() + 60 * 60 * 1000);
        }
        return starts;
    }
    if (bucket === "day") {
        let cursor = startOfDay(since);
        const end = startOfDay(now);
        while (cursor <= end) {
            starts.push(new Date(cursor));
            cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
        }
        return starts;
    }
    let cursor = startOfMonth(since);
    const end = startOfMonth(now);
    while (cursor <= end) {
        starts.push(new Date(cursor));
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    return starts;
}

function buildTokenSeries(
    activities: Activity[],
    since: Date,
    bucket: "hour" | "day" | "month",
    now: Date,
): TokenSeriesPoint[] {
    const bucketStarts = buildBucketStarts(since, bucket, now);
    const rowLowerBound = bucketStarts[0] ?? since;
    const totals = new Map<number, number>();
    for (const start of bucketStarts) {
        totals.set(start.getTime(), 0);
    }

    for (const activity of activities) {
        if (activity.status !== "completed" || !activity.completedAt) continue;
        if (activity.completedAt < rowLowerBound) continue;
        const key = bucketKey(activity.completedAt, bucket);
        if (!totals.has(key)) continue;
        const tokens = (activity.inputToken ?? 0) + (activity.outputToken ?? 0);
        totals.set(key, (totals.get(key) ?? 0) + tokens);
    }

    return bucketStarts.map((start) => ({
        bucketStart: start.toISOString(),
        tokens: totals.get(start.getTime()) ?? 0,
    }));
}

function buildTokenBreakdown(
    completed: Activity[],
    keyOf: (activity: Activity) => string,
    limit = 5,
): TokenBreakdownItem[] {
    const totals = new Map<string, number>();
    for (const activity of completed) {
        const key = keyOf(activity);
        const tokens = (activity.inputToken ?? 0) + (activity.outputToken ?? 0);
        totals.set(key, (totals.get(key) ?? 0) + tokens);
    }
    return [...totals.entries()]
        .map(([label, tokens]) => ({ label, tokens }))
        .sort((a, b) => b.tokens - a.tokens)
        .slice(0, limit);
}

export function buildActivitySummary(rangeInput: string | null | undefined): ActivitySummaryResponse {
    const range = parseDashboardRange(rangeInput);
    const now = new Date();
    const { since, bucket } = resolveSince(range, now);
    const reviewTypes = new Set(["pr_review", "issue_open"]);
    const replyTypes = new Set(["pr_reply", "issue_reply"]);

    const finished = activityList.filter(
        (a) =>
            (a.status === "completed" || a.status === "failed") &&
            a.completedAt !== null &&
            a.completedAt >= since,
    );
    const completed = finished.filter((a) => a.status === "completed");

    return {
        range,
        stats: {
            totalActivity: finished.length,
            errors: finished.filter((a) => a.status === "failed").length,
            reviews: finished.filter((a) => reviewTypes.has(a.type)).length,
            replies: finished.filter((a) => replyTypes.has(a.type)).length,
        },
        recent: [...finished]
            .sort((a, b) => {
                const aTime = a.completedAt?.getTime() ?? 0;
                const bTime = b.completedAt?.getTime() ?? 0;
                return bTime - aTime;
            })
            .slice(0, 5),
        tokenSeries: buildTokenSeries(activityList, since, bucket, now),
        tokensByModel: buildTokenBreakdown(completed, (a) => a.modelName),
        tokensByRepository: buildTokenBreakdown(completed, (a) => a.repositoryPath),
        inProgress: activityList.filter((a) => a.status === "started"),
    };
}

export const activitySummary: ActivitySummaryResponse = buildActivitySummary("24h");

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
        models: [{ id: MODEL_QWEN }, { id: MODEL_GEMMA }],
        source: "openai_compatible",
    },
    2: {
        models: [{ id: MODEL_SONNET }, { id: "anthropic/claude-opus-4-7" }],
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
