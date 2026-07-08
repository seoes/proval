// Normalizers that shape git provider data into compact previews for agent tool responses.

import type { Pagination } from "@proval/types";
import type { GitComment, GitPullRequestInlineReview } from "../../../git-provider/types.js";

export const COMMENT_BODY_PREVIEW_LENGTH = 100;

export type AgentCommentPreview = {
    id: number;
    author: string;
    createdAt: string;
    bodyPreview: string;
};

export type AgentInlineReviewPreview = {
    id: string;
    path: string;
    isResolved: boolean;
    createdAt: string;
    commentList: AgentCommentPreview[];
};

function summarizeCommentBody(body: string): string {
    return body.length > COMMENT_BODY_PREVIEW_LENGTH ? body.slice(0, COMMENT_BODY_PREVIEW_LENGTH) + "..." : body;
}

export function toAgentCommentPreview(comment: GitComment): AgentCommentPreview {
    return {
        id: comment.id,
        author: comment.author,
        createdAt: comment.createdAt,
        bodyPreview: summarizeCommentBody(comment.body),
    };
}

export function toAgentPaginatedCommentList(page: Pagination<GitComment>): Pagination<AgentCommentPreview> {
    return {
        itemList: page.itemList.map(toAgentCommentPreview),
        page: page.page,
        limit: page.limit,
        total: page.total,
    };
}

export function toAgentInlineReviewPreview(review: GitPullRequestInlineReview): AgentInlineReviewPreview {
    return {
        id: review.id,
        path: review.path,
        isResolved: review.isResolved,
        createdAt: review.createdAt,
        commentList: review.commentList.map(toAgentCommentPreview),
    };
}

export function toAgentPaginatedInlineReviewList(
    page: Pagination<GitPullRequestInlineReview>,
): Pagination<AgentInlineReviewPreview> {
    return {
        itemList: page.itemList.map(toAgentInlineReviewPreview),
        page: page.page,
        limit: page.limit,
        total: page.total,
    };
}
