import type { LlmSender } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";
import type { Workspace } from "../../git-provider/workspace.js";
import type { ActivityTokenUsage } from "@proval/types";

type PullRequestReviewParams = {
    provider: GitProvider;
    workspace: Workspace;
    llmSender: LlmSender;
    prIid: number;
    isInlineReview: boolean;
    language: string;
};

type PullRequestReplyParams = {
    provider: GitProvider;
    workspace: Workspace;
    llmSender: LlmSender;
    prIid: number;
    commentId: number;
    language: string;
};

export type PullRequestReview = (params: PullRequestReviewParams) => Promise<ActivityTokenUsage>;
export type PullRequestCommentReply = (params: PullRequestReplyParams) => Promise<ActivityTokenUsage>;
export type PullRequestInlineReviewReply = (
    params: PullRequestReplyParams & { inlineReviewId: string },
) => Promise<ActivityTokenUsage>;

export { runPullRequestReview } from "./review/index.js";
export { runPullRequestReply } from "./reply/index.js";
