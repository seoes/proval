import type { GitComment, GitProvider, GitPullRequestInlineReview } from "../../../git-provider/types.js";
import { COMMENT_BODY_PREVIEW_LENGTH, toAgentCommentPreview } from "../../shared/util/preview.js";

const FOLLOW_UP_THREAD_LIMIT = 50;

function previewBody(body: string): string {
    return body.length > COMMENT_BODY_PREVIEW_LENGTH ? `${body.slice(0, COMMENT_BODY_PREVIEW_LENGTH)}...` : body;
}

function formatCommentLine(comment: GitComment): string {
    const preview = toAgentCommentPreview(comment);
    return `- [#${preview.id}] @${preview.author} (${preview.createdAt}): ${preview.bodyPreview}`;
}

function formatInlineReview(review: GitPullRequestInlineReview): string {
    const commentLineList = review.commentList.map(
        (comment) => `  - [#${comment.id}] @${comment.author}: ${previewBody(comment.body)}`,
    );
    return [
        `- thread ${review.id} path=${review.path}${review.isResolved ? " (resolved)" : ""}`,
        ...commentLineList,
    ].join("\n");
}

/**
 * Compact conversation + inline thread summary for plan/writing follow-up context.
 * Full bodies stay behind get_pull_request_comment / get_pull_request_inline_review_comment.
 */
function byCreatedAtAsc<T extends { createdAt: string }>(a: T, b: T): number {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

export async function buildFollowUpThreadContext(provider: GitProvider, prIid: number): Promise<string> {
    const [commentList, inlineReviewList] = await Promise.all([
        provider.fetchPullRequestCommentList(prIid),
        provider.fetchPullRequestInlineReviewList(prIid),
    ]);

    const recentCommentList = [...commentList].sort(byCreatedAtAsc).slice(-FOLLOW_UP_THREAD_LIMIT);
    const recentInlineList = [...inlineReviewList].sort(byCreatedAtAsc).slice(-FOLLOW_UP_THREAD_LIMIT);

    const commentBlock =
        recentCommentList.length === 0 ? "(none)" : recentCommentList.map(formatCommentLine).join("\n");

    const inlineBlock = recentInlineList.length === 0 ? "(none)" : recentInlineList.map(formatInlineReview).join("\n");

    return [
        "# Existing PR discussion (previews)",
        "This is a follow-up push review. Read these threads so you understand what was already discussed.",
        "Previews are truncated. Call get_pull_request_comment or get_pull_request_inline_review_comment for full text when needed.",
        "",
        `## Conversation comments (${recentCommentList.length})`,
        commentBlock,
        "",
        `## Inline review threads (${recentInlineList.length})`,
        inlineBlock,
    ].join("\n");
}

export function buildPushScopeContext(params: {
    previousHeadSha: string;
    headSha: string;
    pushPathList: string[];
}): string {
    const { previousHeadSha, headSha, pushPathList } = params;
    const pathBlock = pushPathList.length === 0 ? "(none)" : pushPathList.map((path) => `- ${path}`).join("\n");

    return [
        "# Follow-up push scope",
        `Previous reviewed head: ${previousHeadSha}`,
        `Current head: ${headSha}`,
        "",
        `## Files changed in this push (${pushPathList.length})`,
        pathBlock,
        "",
        "Diff tools:",
        "- get_push_changed_file_list / get_push_file_diff — THIS push only (previous reviewed head → current head). Prefer these for coverage and findings.",
        "- get_changed_file_list / get_file_diff — FULL PR (default against=start). Optional against=base compares to the merge target tip. Use only for regression or boundary context.",
        "- get_file_content / grep / glob / list_directory — head snapshot for imports, callers, and surrounding code.",
    ].join("\n");
}
