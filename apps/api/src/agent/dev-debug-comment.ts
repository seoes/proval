import type { ActivityTokenUsage } from "@proval/types";
import type { GitProvider } from "../git-provider/types.js";
import { logError } from "../util/log.js";
import type { LlmSender } from "./llm/loop.js";

type DebugCommentInput = {
    sender: LlmSender;
    workflow: string;
    usage: ActivityTokenUsage;
    fields?: Record<string, string | number | boolean>;
};

function isDevEnvironment(): boolean {
    return process.env.NODE_ENV !== "production";
}

function buildDebugCommentBody({ sender, workflow, usage, fields }: DebugCommentInput): string {
    const model = sender.getModel();
    const lines = ["## Debug Comment", "", `Workflow: ${workflow}`];

    if (fields) {
        for (const [label, value] of Object.entries(fields)) {
            lines.push(`${label}: ${value}`);
        }
    }

    lines.push(
        "",
        `Model: ${model.model} (${model.provider}) @ ${model.baseUrl}`,
        "",
        `Input Token: ${usage.inputToken}`,
        `Cached Input Token: ${usage.cachedInputToken}`,
        `Output Token: ${usage.outputToken}`,
    );

    return lines.join("\n");
}

export async function postDevDebugPullRequestComment(
    provider: GitProvider,
    prIid: number,
    input: DebugCommentInput,
): Promise<void> {
    if (!isDevEnvironment()) return;

    try {
        await provider.createPullRequestComment(prIid, buildDebugCommentBody(input));
    } catch (error) {
        logError("Failed to post dev debug pull request comment", error);
    }
}

export async function postDevDebugIssueComment(
    provider: GitProvider,
    issueIid: number,
    input: DebugCommentInput,
): Promise<void> {
    if (!isDevEnvironment()) return;

    try {
        await provider.createIssueComment(issueIid, buildDebugCommentBody(input));
    } catch (error) {
        logError("Failed to post dev debug issue comment", error);
    }
}
