import type { LlmSender } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";
import type { Workspace } from "../../git-provider/workspace.js";
import type { ActivityTokenUsage } from "@proval/types";

import { runIssueReplyOnOpen } from "./open.service.js";
import { runIssueReply } from "./reply.service.js";

type IssueReplyOnOpenParams = {
    provider: GitProvider;
    workspace: Workspace;
    llmSender: LlmSender;
    issueIid: number;
    language: string;
    activityId: number;
};

type IssueReplyParams = {
    provider: GitProvider;
    workspace: Workspace;
    llmSender: LlmSender;
    issueIid: number;
    commentId: number;
    language: string;
    activityId: number;
};

export type IssueReplyOnOpen = (params: IssueReplyOnOpenParams) => Promise<ActivityTokenUsage>;
export type IssueReply = (params: IssueReplyParams) => Promise<ActivityTokenUsage>;

export { runIssueReplyOnOpen, runIssueReply };
