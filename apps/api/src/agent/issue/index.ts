import type { LlmSender } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";
import type { ActivityTokenUsage } from "@proval/types";

import { runIssueReplyOnOpen } from "./open.service.js";
import { runIssueReply } from "./reply.service.js";

type IssueReplyOnOpenParams = {
    provider: GitProvider;
    llmSender: LlmSender;
    issueIid: number;
    language: string;
};

type IssueReplyParams = {
    provider: GitProvider;
    llmSender: LlmSender;
    issueIid: number;
    commentId: number;
    language: string;
};

export type IssueReplyOnOpen = (params: IssueReplyOnOpenParams) => Promise<ActivityTokenUsage>;
export type IssueReply = (params: IssueReplyParams) => Promise<ActivityTokenUsage>;

export { runIssueReplyOnOpen, runIssueReply };
