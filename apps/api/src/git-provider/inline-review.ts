import type { GitComment, GitDiffLine, GitPullRequestInlineReview } from "./types.js";

export type InlineReviewComment = {
    id: number;
    body: string;
    author: string;
    createdAt: string;
    inReplyToId: number | null;
    path: string | null;
    line?: number | null;
    originalLine?: number | null;
    startLine?: number | null;
    side?: string | null;
    startSide?: string | null;
};

export function resolveInlineReviewRootId(commentId: number, comments: InlineReviewComment[]): number {
    const byId = new Map(comments.map((c) => [c.id, c]));
    let current = byId.get(commentId);
    if (!current) {
        return commentId;
    }
    while (current.inReplyToId !== null) {
        const parent = byId.get(current.inReplyToId);
        if (!parent) {
            break;
        }
        current = parent;
    }
    return current.id;
}

export function mapInlineReviewCommentToDiffLines(comment: InlineReviewComment): {
    start: GitDiffLine;
    end: GitDiffLine;
} {
    const side = comment.side ?? "RIGHT";
    const startSide = comment.startSide ?? side;
    const line = comment.line ?? comment.originalLine;
    const startLine = comment.startLine ?? line;

    const toDiffLine = (lineNum: number | null | undefined, s: string): GitDiffLine => {
        if (s === "LEFT") {
            return { type: "old", oldLine: lineNum ?? undefined };
        }
        return { type: "new", newLine: lineNum ?? undefined };
    };

    if (startLine !== null && startLine !== undefined && line !== null && line !== undefined && startLine !== line) {
        return {
            start: toDiffLine(startLine, startSide),
            end: toDiffLine(line, side),
        };
    }

    const single = toDiffLine(line ?? startLine, side);
    return { start: single, end: single };
}

export function buildInlineReviewList(comments: InlineReviewComment[]): GitPullRequestInlineReview[] {
    const withPath = comments.filter((c) => c.path);
    if (withPath.length === 0) {
        return [];
    }

    const rootIds = new Set<number>();
    for (const comment of withPath) {
        rootIds.add(resolveInlineReviewRootId(comment.id, withPath));
    }

    const reviews: GitPullRequestInlineReview[] = [];

    for (const rootId of rootIds) {
        const threadComments = collectThreadComments(rootId, withPath);
        const root = threadComments.find((c) => c.id === rootId) ?? threadComments[0];
        if (!root?.path) {
            continue;
        }

        const { start, end } = mapInlineReviewCommentToDiffLines(root);
        threadComments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        reviews.push({
            id: String(rootId),
            path: root.path,
            start,
            end,
            createdAt: root.createdAt,
            isResolved: false,
            commentList: threadComments.map(
                (c): GitComment => ({
                    id: c.id,
                    body: c.body,
                    author: c.author,
                    createdAt: c.createdAt,
                }),
            ),
        });
    }

    reviews.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return reviews;
}

function collectThreadComments(rootId: number, comments: InlineReviewComment[]): InlineReviewComment[] {
    const byId = new Map(comments.map((c) => [c.id, c]));
    const inThread = new Set<number>();

    for (const comment of comments) {
        const root = resolveInlineReviewRootId(comment.id, comments);
        if (root === rootId) {
            inThread.add(comment.id);
        }
    }

    return [...inThread].map((id) => byId.get(id)).filter((c): c is InlineReviewComment => c !== undefined);
}

export function findInlineReviewById(
    reviews: GitPullRequestInlineReview[],
    inlineReviewId: string,
): GitPullRequestInlineReview | null {
    const direct = reviews.find((r) => r.id === inlineReviewId);
    if (direct) {
        return direct;
    }

    const numericId = Number(inlineReviewId);
    if (!Number.isFinite(numericId)) {
        return null;
    }

    return reviews.find((r) => r.commentList.some((c) => c.id === numericId)) ?? null;
}
