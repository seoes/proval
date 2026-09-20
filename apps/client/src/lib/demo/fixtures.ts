import type {
    AccessResponse,
    ActivityLogEntry,
    ActivityLogResponse,
    ActivityResponse,
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
import { dateOnlyToLocalDate, parseDateOnlyEndExclusiveLocal } from "$lib/utils/date.js";

function minutesAgo(minutes: number): Date {
    return new Date(Date.now() - minutes * 60 * 1000);
}

function daysAgo(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

const MODEL_QWEN = "Qwen/Qwen3.8-27B";
const MODEL_GEMMA = "google/gemma-4-12b";
const MODEL_OPUS = "anthropic/claude-opus-5.2";

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
        timeoutSecond: 600,
        createdAt: daysAgo(210),
        updatedAt: minutesAgo(60 * 24 * 2),
    },
    {
        id: 2,
        provider: "openai",
        label: "External LLM API",
        baseUrl: "https://api.openrouter.ai/api/v1",
        timeoutSecond: 600,
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
        description: "auth app",
        provider: "gitlab",
        language: "English",
        gitProviderAccessId: 1,
        gitProviderRepositoryId: 101,
        githubInstallationId: null,
        githubRepositoryId: null,
        prEnabled: true,
        prMinAccessLevel: 0,
        prReviewEnabled: true,
        prInlineReview: true,
        prReviewOnPush: "on_every_push",
        prIgnoreDraft: true,
        prReplyEnabled: true,
        prMentionOnly: true,
        issueEnabled: true,
        issueMinAccessLevel: 0,
        issueCommentOnOpenEnabled: true,
        issueLabelOnOpenEnabled: true,
        issueReplyEnabled: true,
        issueMentionOnly: false,
        modelProviderId: 1,
        modelName: MODEL_QWEN,
        createdAt: daysAgo(200),
        updatedAt: minutesAgo(60 * 24),
        lastUsedAt: minutesAgo(12),
    },
    {
        id: 2,
        path: "dowonseo/web-app",
        description: "mono web app",
        provider: "github",
        language: "English",
        gitProviderAccessId: null,
        gitProviderRepositoryId: null,
        githubInstallationId: 1,
        githubRepositoryId: 201,
        prEnabled: true,
        prMinAccessLevel: 0,
        prReviewEnabled: true,
        prInlineReview: true,
        prReviewOnPush: "on_every_push",
        prIgnoreDraft: true,
        prReplyEnabled: true,
        prMentionOnly: false,
        issueEnabled: true,
        issueMinAccessLevel: 0,
        issueCommentOnOpenEnabled: false,
        issueLabelOnOpenEnabled: true,
        issueReplyEnabled: false,
        issueMentionOnly: false,
        modelProviderId: 2,
        modelName: MODEL_OPUS,
        createdAt: daysAgo(180),
        updatedAt: minutesAgo(60 * 12),
        lastUsedAt: minutesAgo(45),
    },
    {
        id: 3,
        path: "somedude/expense-tracker",
        description: "expense logging",
        provider: "forgejo",
        language: "English",
        gitProviderAccessId: 1,
        gitProviderRepositoryId: 301,
        githubInstallationId: null,
        githubRepositoryId: null,
        prEnabled: true,
        prMinAccessLevel: 0,
        prReviewEnabled: true,
        prInlineReview: false,
        prReviewOnPush: "on_first_push",
        prIgnoreDraft: false,
        prReplyEnabled: false,
        prMentionOnly: false,
        issueEnabled: true,
        issueMinAccessLevel: 0,
        issueCommentOnOpenEnabled: true,
        issueLabelOnOpenEnabled: true,
        issueReplyEnabled: true,
        issueMentionOnly: true,
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
    provider: ActivityResponse["provider"];
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
        modelName: MODEL_OPUS,
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
    type: ActivityResponse["type"],
    rng: () => number,
): { inputToken: number; cachedInputToken: number; outputToken: number } {
    const cacheRatio = 0.74 + rng() * 0.12;

    if (type === "pr_review") {
        const roll = rng();
        let inputToken: number;
        if (roll < 0.15) inputToken = randInt(rng, 720000, 880000);
        else if (roll < 0.85) inputToken = randInt(rng, 880000, 1180000);
        else inputToken = randInt(rng, 1180000, 1550000);
        return {
            inputToken,
            cachedInputToken: Math.floor(inputToken * cacheRatio),
            outputToken: randInt(rng, 230000, 370000),
        };
    }

    const roll = rng();
    let inputToken: number;
    if (roll < 0.3) inputToken = randInt(rng, 100000, 200000);
    else if (roll < 0.8) inputToken = randInt(rng, 200000, 380000);
    else inputToken = randInt(rng, 380000, 500000);
    return {
        inputToken,
        cachedInputToken: Math.floor(inputToken * cacheRatio),
        outputToken: randInt(rng, 38000, 62000),
    };
}

function pickType(rng: () => number): ActivityResponse["type"] {
    const roll = rng();
    if (roll < 0.62) return "pr_review";
    if (roll < 0.82) return "pr_reply";
    if (roll < 0.92) return "issue_reply";
    return "issue_open";
}

/** Recent showcase rows for the activity feed (last ~14h). */
const recentActivityList: ActivityResponse[] = [
    {
        id: 1,
        repositoryId: 2,
        repositoryPath: "dowonseo/web-app",
        provider: "github",
        modelProviderId: 2,
        modelName: MODEL_OPUS,
        type: "pr_review",
        status: "started",
        targetIid: 142,
        headSha: "a1b2c3d4e5f6789012345678abcdef0123456789",
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
        headSha: "a1b2c3d4e5f6789012345678abcdef0123456789",
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
        modelName: MODEL_OPUS,
        type: "pr_review",
        status: "completed",
        targetIid: 141,
        headSha: "a1b2c3d4e5f6789012345678abcdef0123456789",
        inputToken: 1048200,
        cachedInputToken: 838600,
        outputToken: 312400,
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
        headSha: "a1b2c3d4e5f6789012345678abcdef0123456789",
        inputToken: 876400,
        cachedInputToken: 701100,
        outputToken: 268500,
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
        headSha: "a1b2c3d4e5f6789012345678abcdef0123456789",
        inputToken: 912000,
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
        modelName: MODEL_OPUS,
        type: "pr_reply",
        status: "completed",
        targetIid: 140,
        headSha: null,
        inputToken: 286400,
        cachedInputToken: 229100,
        outputToken: 48200,
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
        headSha: null,
        inputToken: 164800,
        cachedInputToken: 133500,
        outputToken: 51400,
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
        modelName: MODEL_OPUS,
        type: "pr_review",
        status: "failed",
        targetIid: 139,
        headSha: "a1b2c3d4e5f6789012345678abcdef0123456789",
        inputToken: 1156000,
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
        headSha: "a1b2c3d4e5f6789012345678abcdef0123456789",
        inputToken: 1186700,
        cachedInputToken: 961200,
        outputToken: 294800,
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
        headSha: null,
        inputToken: 218500,
        cachedInputToken: 174800,
        outputToken: 47600,
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
        modelName: MODEL_OPUS,
        type: "pr_review",
        status: "completed",
        targetIid: 138,
        headSha: "a1b2c3d4e5f6789012345678abcdef0123456789",
        inputToken: 1324500,
        cachedInputToken: 1046400,
        outputToken: 341200,
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
        headSha: null,
        inputToken: 412600,
        cachedInputToken: 330100,
        outputToken: 54800,
        errorMessage: null,
        completedAt: minutesAgo(800),
        createdAt: minutesAgo(810),
        updatedAt: minutesAgo(800),
    },
];

/**
 * Year-to-date history so 30d / year charts look like a real small team
 * (weekday-heavy). Starts Jan 1 or 90 days ago, whichever is earlier.
 */
function buildHistoricalActivities(): ActivityResponse[] {
    const rng = mulberry32(20260710);
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 2);
    const threeMonthsAgo = daysAgo(92);
    const start = yearStart < threeMonthsAgo ? yearStart : threeMonthsAgo;

    const activities: ActivityResponse[] = [];
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
            const completedAt = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), hour, minute);
            const durationMin = type === "pr_review" ? randInt(rng, 4, 18) : randInt(rng, 1, 6);
            const createdAt = new Date(completedAt.getTime() - durationMin * 60 * 1000);
            const tokens = failed
                ? {
                      inputToken: type === "pr_review" ? randInt(rng, 700000, 1300000) : randInt(rng, 100000, 450000),
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
                headSha: type === "pr_review" ? `deadbeef${String(nextId).padStart(32, "0")}`.slice(0, 40) : null,
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

export const activityList: ActivityResponse[] = [...recentActivityList, ...buildHistoricalActivities()];

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
    activities: ActivityResponse[],
    since: Date,
    bucket: "hour" | "day" | "month",
    now: Date,
): TokenSeriesPoint[] {
    const bucketStarts = buildBucketStarts(since, bucket, now);
    const rowLowerBound = bucketStarts[0] ?? since;
    type BucketTotals = { inputToken: number; outputToken: number; cachedInputToken: number };
    const totals = new Map<number, BucketTotals>();
    for (const start of bucketStarts) {
        totals.set(start.getTime(), { inputToken: 0, outputToken: 0, cachedInputToken: 0 });
    }

    for (const activity of activities) {
        if (
            (activity.status !== "completed" && activity.status !== "failed" && activity.status !== "canceled") ||
            !activity.completedAt
        )
            continue;
        if (activity.completedAt < rowLowerBound) continue;
        const key = bucketKey(activity.completedAt, bucket);
        const bucketTotals = totals.get(key);
        if (!bucketTotals) continue;
        bucketTotals.inputToken += activity.inputToken ?? 0;
        bucketTotals.outputToken += activity.outputToken ?? 0;
        bucketTotals.cachedInputToken += activity.cachedInputToken ?? 0;
    }

    return bucketStarts.map((start) => {
        const bucketTotals = totals.get(start.getTime()) ?? { inputToken: 0, outputToken: 0, cachedInputToken: 0 };
        const tokens = bucketTotals.inputToken + bucketTotals.outputToken;
        return {
            bucketStart: start.toISOString(),
            tokens,
            inputToken: bucketTotals.inputToken,
            outputToken: bucketTotals.outputToken,
            cachedInputToken: bucketTotals.cachedInputToken,
        };
    });
}

function buildTokenBreakdown(
    completed: ActivityResponse[],
    keyOf: (activity: ActivityResponse) => string,
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

export function buildActivitySummary(
    rangeInput: string | null | undefined,
    repositoryId?: number,
): ActivitySummaryResponse {
    const range = parseDashboardRange(rangeInput);
    const now = new Date();
    const { since, bucket } = resolveSince(range, now);
    const reviewTypes = new Set(["pr_review", "issue_open"]);
    const replyTypes = new Set(["pr_reply", "issue_reply"]);

    const finished = activityList.filter(
        (a) =>
            (a.status === "completed" || a.status === "failed" || a.status === "canceled") &&
            a.completedAt !== null &&
            a.completedAt >= since &&
            (repositoryId == null || a.repositoryId === repositoryId),
    );
    const scopedActivityList =
        repositoryId == null ? activityList : activityList.filter((a) => a.repositoryId === repositoryId);
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
        tokenSeries: buildTokenSeries(scopedActivityList, since, bucket, now),
        tokensByModel: buildTokenBreakdown(finished, (a) => a.modelName),
        tokensByRepository: repositoryId != null ? [] : buildTokenBreakdown(finished, (a) => a.repositoryPath),
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
        models: [{ id: MODEL_OPUS }, { id: "anthropic/claude-opus-4-7" }],
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

export function getActivityById(id: number): ActivityResponse | undefined {
    return activityList.find((a) => a.id === id);
}

export function getActivityLogsById(id: number): ActivityLogResponse | undefined {
    const activity = getActivityById(id);
    if (!activity) return undefined;

    const base = activity.createdAt.getTime();
    const sample: ActivityLogEntry[] = [
        {
            timestamp: new Date(base).toISOString(),
            level: "info",
            label: `[PR #${activity.targetIid}] Review`,
            message: "fetching pull request version",
        },
        {
            timestamp: new Date(base + 400).toISOString(),
            level: "info",
            label: `[PR #${activity.targetIid}] Review`,
            message: "version ready head=abc123def456…",
        },
        {
            timestamp: new Date(base + 1800).toISOString(),
            level: "info",
            label: `[PR #${activity.targetIid}] Review`,
            message: "ready (head=abc123def456…)",
        },
        {
            timestamp: new Date(base + 3200).toISOString(),
            level: "info",
            label: `[PR #${activity.targetIid}] Plan`,
            message: "loop started",
        },
        {
            timestamp: new Date(base + 5100).toISOString(),
            level: "info",
            label: `[PR #${activity.targetIid}] Plan`,
            message: '→ get_file_diff({"path":"src/app.ts"})',
        },
    ];

    if (activity.status === "failed") {
        sample.push({
            timestamp: new Date(base + 8000).toISOString(),
            level: "error",
            label: `[PR #${activity.targetIid}] Writing`,
            message: `agent loop failed: ${activity.errorMessage ?? "unknown error"}`,
        });
    } else if (activity.status === "completed") {
        sample.push({
            timestamp: new Date(base + 12000).toISOString(),
            level: "info",
            label: `[PR #${activity.targetIid}] Writing`,
            message: "completed in 8.2s · 4 steps · tools: post_pull_request_comment×1 · in=1200 out=400",
        });
    } else {
        sample.push({
            timestamp: new Date(base + 7000).toISOString(),
            level: "info",
            label: `[PR #${activity.targetIid}] Writing`,
            message: "loop started",
        });
    }

    return { status: activity.status, logs: sample };
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

export function paginateActivityList(
    page: number,
    limit: number,
    filter: {
        statusList?: ActivityResponse["status"][];
        typeList?: ActivityResponse["type"][];
        repositoryIdList?: number[];
        from?: string;
        to?: string;
    } = {},
): Pagination<ActivityResponse> {
    const { statusList = [], typeList = [], repositoryIdList = [], from = "", to = "" } = filter;

    let filtered = activityList;

    if (statusList.length) {
        const allowed = new Set(statusList);
        filtered = filtered.filter((item) => allowed.has(item.status));
    }
    if (typeList.length) {
        const allowed = new Set(typeList);
        filtered = filtered.filter((item) => allowed.has(item.type));
    }
    if (repositoryIdList.length) {
        const allowed = new Set(repositoryIdList);
        filtered = filtered.filter((item) => item.repositoryId != null && allowed.has(item.repositoryId));
    }
    if (from) {
        const fromDate = dateOnlyToLocalDate(from);
        if (fromDate) {
            filtered = filtered.filter((item) => new Date(item.createdAt).getTime() >= fromDate.getTime());
        }
    }
    if (to) {
        const toExclusive = parseDateOnlyEndExclusiveLocal(to);
        if (toExclusive) {
            filtered = filtered.filter((item) => new Date(item.createdAt).getTime() < toExclusive.getTime());
        }
    }

    const sorted = [...filtered].sort((a, b) => {
        const aStarted = a.status === "started" ? 0 : 1;
        const bStarted = b.status === "started" ? 0 : 1;
        if (aStarted !== bStarted) return aStarted - bStarted;
        const createdDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (createdDiff !== 0) return createdDiff;
        return b.id - a.id;
    });

    const total = sorted.length;
    const start = (page - 1) * limit;
    const itemList = sorted.slice(start, start + limit);
    return { itemList, page, limit, total };
}
