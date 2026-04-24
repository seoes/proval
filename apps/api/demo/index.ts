import { mkdir } from "node:fs/promises";
import path from "node:path";
import { mentionReply } from "../mock/input/mention-reply.js";
import { newFeature } from "../mock/input/new-feature.js";
import { securityIssue } from "../mock/input/security-issue.js";
import { simpleBugfix } from "../mock/input/simple-bugfix.js";
import { MergeRequestService } from "../src/module/merge-request/merge-request.service.js";
import { MockProvider, type PostedAction, type TestInput } from "../mock/provider.js";

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

function createService(input: TestInput, opts: { model?: string; language?: string; allowApproval?: boolean }) {
    const provider = new MockProvider(input);
    const service = new MergeRequestService(
        provider,
        Bun.env.OPENAI_BASE_URL!,
        Bun.env.OPENAI_API_KEY!,
        opts.model ?? Bun.env.OPENAI_MODEL!,
        opts.language ?? Bun.env.LANGUAGE ?? "English",
        opts.allowApproval ?? false,
        "important_only",
        "standard",
    );
    return { provider, service };
}

function lastCommentBody(posted: PostedAction[]): string | undefined {
    const comments = posted.filter((p) => p.type === "comment");
    const last = comments[comments.length - 1];
    return last?.body;
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
        console.error(
            "Missing OPENAI_BASE_URL, OPENAI_API_KEY, or OPENAI_MODEL. Copy env.test.example to .env.test and fill in.",
        );
        process.exit(1);
    }

    const keys = Object.keys(registry).sort();
    let scenarioKey = process.argv[2];

    if (!scenarioKey) {
        console.log("Available scenarios:\n");
        for (const k of keys) {
            console.log(`  ${k}`);
        }
        if (!process.stdin.isTTY) {
            console.error("\nUsage: bun run demo <scenario-key>");
            process.exit(1);
        }
        scenarioKey = (prompt("Enter scenario name: ") ?? "").trim();
    }

    if (!scenarioKey || !registry[scenarioKey]) {
        console.error(`Unknown scenario: ${scenarioKey ?? "(empty)"}`);
        process.exit(1);
    }

    const entry = registry[scenarioKey]!;
    const language = entry.language ?? Bun.env.LANGUAGE ?? "English";
    const allowApproval = entry.mode === "review" ? (entry.allowApproval ?? false) : false;
    const model = Bun.env.OPENAI_MODEL!;

    const { provider, service } = createService(entry.data, {
        language,
        allowApproval,
        model,
    });

    console.log(`Running demo: ${scenarioKey} (${entry.mode})…`);

    if (entry.mode === "review") {
        await service.review(1);
    } else {
        await service.reply(1, entry.commenter, entry.comment);
    }

    const body = lastCommentBody(provider.posted);
    if (!body) {
        console.error("No comment was posted by the model (posted:", provider.posted, ")");
        process.exit(1);
    }

    const ranAt = new Date().toISOString();
    const md = buildMarkdownReport({
        scenarioKey,
        entry,
        model,
        language,
        allowApproval,
        ranAt,
        posted: [...provider.posted],
        bodyMarkdown: body,
    });

    const resultDir = path.join(import.meta.dir, "result");
    await mkdir(resultDir, { recursive: true });
    const fileName = `${scenarioKey}-${fileTimestamp()}.md`;
    const outPath = path.join(resultDir, fileName);
    await Bun.write(outPath, md);

    console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
