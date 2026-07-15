import { mkdir } from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import { mentionReply } from "../mock/input/mention-reply.js";
import { newFeature } from "../mock/input/new-feature.js";
import { securityIssue } from "../mock/input/security-issue.js";
import { simpleBugfix } from "../mock/input/simple-bugfix.js";
import { runPullRequestReply, runPullRequestReview } from "../src/agent/pull-request/index.js";
import { log, logError } from "../src/util/log.js";
import { MockProvider, type PostedAction, type TestInput } from "../mock/provider.js";
import { createSender } from "../src/agent/llm/factory.js";
import { Workspace } from "../src/git-provider/workspace.js";

type ReviewEntry = {
    mode: "review";
    data: TestInput;
    language?: string;
    allowApproval?: boolean;
};

type ReplyEntry = {
    mode: "reply";
    data: TestInput;
    commenter: string;
    comment: string;
    language?: string;
};

type DemoEntry = ReviewEntry | ReplyEntry;

const registry: Record<string, DemoEntry> = {
    "simple-bugfix": { mode: "review", data: simpleBugfix },
    "simple-bugfix-allow-approval": { mode: "review", data: simpleBugfix, allowApproval: true },
    "new-feature": { mode: "review", data: newFeature },
    "security-issue": { mode: "review", data: securityIssue },
    "mention-reply": {
        mode: "reply",
        data: mentionReply,
        commenter: "human_user",
        comment: "@test_bot should we add max length on email in the schema?",
    },
};

function hasOpenAiEnv(): boolean {
    return Boolean(Bun.env.OPENAI_BASE_URL?.trim() && Bun.env.OPENAI_API_KEY?.trim() && Bun.env.OPENAI_MODEL?.trim());
}

function fileTimestamp(d = new Date()): string {
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const h = String(d.getUTCHours()).padStart(2, "0");
    const mi = String(d.getUTCMinutes()).padStart(2, "0");
    const s = String(d.getUTCSeconds()).padStart(2, "0");
    return `${y}-${mo}-${day}-${h}-${mi}-${s}`;
}

function yamlEscapeScalar(s: string): string {
    return JSON.stringify(s);
}

function buildMarkdownReport(args: {
    scenarioKey: string;
    entry: DemoEntry;
    model: string;
    language: string;
    allowApproval: boolean;
    ranAt: string;
    posted: PostedAction[];
    bodyMarkdown: string;
}): string {
    const { scenarioKey, entry, model, language, allowApproval, ranAt, posted, bodyMarkdown } = args;

    const lines: string[] = ["---"];
    lines.push(`input: ${yamlEscapeScalar(scenarioKey)}`);
    lines.push(`mode: ${entry.mode}`);
    lines.push(`model: ${yamlEscapeScalar(model)}`);
    lines.push(`language: ${yamlEscapeScalar(language)}`);
    lines.push(`allowApproval: ${allowApproval}`);
    lines.push(`ranAt: ${yamlEscapeScalar(ranAt)}`);
    if (entry.mode === "reply") {
        lines.push(`commenter: ${yamlEscapeScalar(entry.commenter)}`);
        lines.push(`comment: ${yamlEscapeScalar(entry.comment)}`);
    }
    lines.push("posted:");
    for (const p of posted) {
        const preview = p.body.length > 240 ? `${p.body.slice(0, 240)}…` : p.body;
        lines.push(`  - type: ${p.type}`);
        lines.push(`    preview: ${yamlEscapeScalar(preview.replace(/\r?\n/g, " "))}`);
    }
    lines.push("---");
    lines.push("");
    lines.push(bodyMarkdown.trimEnd());
    lines.push("");
    return lines.join("\n");
}

async function main() {
    if (!hasOpenAiEnv()) {
        logError(
            "Missing OPENAI_BASE_URL, OPENAI_API_KEY, or OPENAI_MODEL. Copy env.test.example to .env.test and fill in.",
            undefined,
            "demo",
        );
        process.exit(1);
    }

    const keys = Object.keys(registry).sort();
    let scenarioKey = process.argv[2];

    if (!scenarioKey) {
        log("Available scenarios:", "demo");
        for (const k of keys) {
            log(`  ${pc.cyan(k)}`, "demo");
        }
        if (!process.stdin.isTTY) {
            logError("Usage: bun run demo <scenario-key>", undefined, "demo");
            process.exit(1);
        }
        scenarioKey = (prompt("Enter scenario name: ") ?? "").trim();
    }

    if (!scenarioKey || !registry[scenarioKey]) {
        logError(`Unknown scenario: ${scenarioKey ?? "(empty)"}`, undefined, "demo");
        process.exit(1);
    }

    const model = Bun.env.OPENAI_MODEL;

    if (!model) {
        logError("Missing OPENAI_MODEL. Copy env.demo.example to .env.demo and fill in.", undefined, "demo");
        process.exit(1);
    }

    const entry = registry[scenarioKey];
    if (!entry) {
        logError(`Unknown scenario: ${scenarioKey ?? "(empty)"}`, undefined, "demo");
        process.exit(1);
    }

    const language = entry.language ?? Bun.env.LANGUAGE ?? "English";
    const allowApproval = entry.mode === "review" ? (entry.allowApproval ?? false) : false;

    const llmSender = createSender({
        provider: "openai",
        apiKey: Bun.env.OPENAI_API_KEY ?? "",
        baseURL: Bun.env.OPENAI_BASE_URL ?? "",
        model: Bun.env.OPENAI_MODEL ?? "",
    });

    const provider = new MockProvider(entry.data);
    const workspace = new Workspace(provider);
    await workspace.loadMock({
        files: entry.data.files ?? {},
        diffs: entry.data.diffs,
    });

    log(`running ${pc.bold(scenarioKey)} (${pc.yellow(entry.mode)})`, "demo");

    if (entry.mode === "review") {
        await runPullRequestReview({
            provider,
            workspace,
            llmSender,
            prIid: 1,
            isInlineReview: false,
            language,
        });
    } else {
        await runPullRequestReply({
            provider,
            workspace,
            llmSender,
            prIid: 1,
            commentId: entry.data.commentList?.[0]?.id ?? 1,
            inlineReviewId: null,
            language,
        });
    }

    const ranAt = new Date().toISOString();
    const md = buildMarkdownReport({
        scenarioKey,
        entry,
        model,
        language,
        allowApproval,
        ranAt,
        posted: [],
        bodyMarkdown: "",
    });

    const resultDir = path.join(import.meta.dir, "result");
    await mkdir(resultDir, { recursive: true });
    const fileName = `${scenarioKey}-${fileTimestamp()}.md`;
    const outPath = path.join(resultDir, fileName);
    await Bun.write(outPath, md);

    log(`wrote ${pc.green(outPath)}`, "demo");
}

main().catch((err) => {
    logError("Demo failed", err, "demo");
    process.exit(1);
});
