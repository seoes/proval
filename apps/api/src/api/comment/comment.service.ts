import { activityTable, commentTable } from "@proval/db";
import db from "../../db/index.js";
import { and, eq } from "drizzle-orm";

export type CommentType = (typeof commentTable.$inferSelect)["type"];

export class CommentService {
    public async create(activityId: number, type: CommentType, commentId: number, body: string) {
        if (commentId < 1) return;
        await db
            .insert(commentTable)
            .values({
                activityId,
                type,
                commentId,
                body,
            })
            .onConflictDoNothing();
    }

    public async find(repositoryId: number, type: CommentType, commentId: number) {
        const [comment] = await db
            .select()
            .from(commentTable)
            .innerJoin(activityTable, eq(commentTable.activityId, activityTable.id))
            .where(
                and(
                    eq(activityTable.repositoryId, repositoryId),
                    eq(commentTable.type, type),
                    eq(commentTable.commentId, commentId),
                ),
            );
        return comment ?? null;
    }
}
