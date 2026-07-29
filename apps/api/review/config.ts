export type ReviewConfig = {
    repoUrl: string;
    repoToken: string;
    baseBranch: string;
    headBranch: string;
    prTitle: string;
    prBody: string;
    llmBaseUrl: string;
    llmApiKey: string;
    llmModel: string;
    language: string;
    inlineReview: boolean;
    saveResult: boolean;
};

function requireEnv(key: string): string {
    const value = Bun.env[key]?.trim();
    if (!value) {
        throw new Error(`Missing required env: ${key}`);
    }
    return value;
}

function parseInlineReview(raw: string | undefined): boolean {
    if (raw == null || raw.trim() === "") {
        return true;
    }
    const normalized = raw.trim().toLowerCase();
    if (normalized === "false" || normalized === "0") {
        return false;
    }
    return true;
}

function parseSaveResult(raw: string | undefined): boolean {
    if (raw == null || raw.trim() === "") {
        return false;
    }
    const normalized = raw.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
}

export function loadConfig(): ReviewConfig {
    return {
        repoUrl: requireEnv("REPO_URL"),
        repoToken: Bun.env.REPO_TOKEN?.trim() ?? "",
        baseBranch: requireEnv("BASE_BRANCH"),
        headBranch: requireEnv("HEAD_BRANCH"),
        prTitle: Bun.env.PR_TITLE?.trim() || "local review",
        prBody: Bun.env.PR_BODY?.trim() ?? "",
        llmBaseUrl: requireEnv("LLM_BASE_URL"),
        llmApiKey: requireEnv("LLM_API_KEY"),
        llmModel: requireEnv("LLM_MODEL"),
        language: Bun.env.LANGUAGE?.trim() || "English",
        inlineReview: parseInlineReview(Bun.env.INLINE_REVIEW),
        saveResult: parseSaveResult(Bun.env.SAVE_RESULT),
    };
}
