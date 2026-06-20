import type { GitProvider } from "../../git-provider/types";

export async function generateIssuePrompt(provider: GitProvider, issueIid: number): Promise<string> {
    const detail = await provider.fetchIssueDetail(issueIid);
    const commentList = await provider.fetchIssueCommentList(issueIid);

    return [`Issue: ${JSON.stringify(detail)}`, `Comment List: ${JSON.stringify(commentList)}`].join("\n\n");
}
