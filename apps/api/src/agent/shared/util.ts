import type { Pagination } from "@proval/types";
import type { GitComment, GitPullRequestInlineReview } from "../../git-provider/types.js";

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

export function slicePage<T>(items: T[], page: number, limit: number): Pagination<T> {
    const total = items.length;
    const start = (page - 1) * limit;
    const itemList = items.slice(start, start + limit);
    return { itemList, page, limit, total };
}

export function summarizeCommentBody(body: string): string {
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

export function parseListToolPagination(args: Record<string, unknown>): { page: number; limit: number } {
    const page = Number(args.page);
    const limit = Number(args.limit);
    if (!Number.isFinite(page) || page < 1) {
        throw new Error("page must be a positive number");
    }
    if (!Number.isFinite(limit) || limit < 1) {
        throw new Error("limit must be a positive number");
    }
    return { page, limit };
}
