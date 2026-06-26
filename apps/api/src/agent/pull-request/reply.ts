import type { ActivityTokenUsage } from "@proval/types";
import type { GitProvider } from "../../git-provider/types";
import { runAgentLoop, type LlmSender } from "../llm/loop";
import { PR_REPLY_BODY } from "../prompt";
import { COMMENT_LANGUAGE_RULE } from "../prompt";
import {
    getDirectoryTreeTool,
    getFileDiffTool,
    getMergeFileContentTool,
    getPullRequestDetailTool,
    postPullRequestReplyTool,
    searchCodeListTool,
    searchLineByKeywordTool,
} from "../tool";

export async function runPullRequestReply(
    provider: GitProvider,
    sender: LlmSender,
    prIid: number,
    commenterUsername: string,
    commentBody: string,
    language: string,
): Promise<ActivityTokenUsage> {
    const { baseSha, headSha } = await provider.fetchPullRequestVersion(prIid);
    const commentList = await provider.fetchPullRequestCommentList(prIid);
    const system = [PR_REPLY_BODY, COMMENT_LANGUAGE_RULE].join("\n");
    const prompt = `Commenter Username: ${commenterUsername}, Comment Body: ${commentBody}, Comment List: ${JSON.stringify(commentList)}`;
    const toolList = [
        getPullRequestDetailTool(provider, prIid),
        getFileDiffTool(provider, prIid),
        searchCodeListTool(provider, headSha),
        searchLineByKeywordTool(provider, headSha),
        getDirectoryTreeTool(provider, headSha),
        getMergeFileContentTool(provider, { baseSha, headSha }),
        postPullRequestReplyTool(provider, prIid, commenterUsername, language),
    ];

    const result = await runAgentLoop(sender, system, prompt, `[PR #${prIid}] Reply`, {
        toolList,
    });

    return result.usage;
}
