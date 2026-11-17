import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GoldenComment } from "./logic.js";

export type GoldenPullRequest = {
    url: string;
    prTitle?: string;
    commentList: GoldenComment[];
};

export const GOLDEN_DIR = join(import.meta.dir, "golden");

export async function loadGoldenByUrl(dir: string = GOLDEN_DIR): Promise<{
    byUrl: Map<string, GoldenComment[]>;
    categoryByComment: Map<string, string>;
    pullRequestCount: number;
    commentCount: number;
}> {
    const byUrl = new Map<string, GoldenComment[]>();
    const categoryByComment = new Map<string, string>();
    let commentCount = 0;
    const fileNameList = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
    for (const fileName of fileNameList) {
        const entryList = JSON.parse(await readFile(join(dir, fileName), "utf-8")) as {
            url?: string;
            comments?: { comment?: string; severity?: string; category?: string }[];
        }[];
        for (const entry of entryList) {
            if (!entry.url) throw new Error(`golden entry in ${fileName} is missing url`);
            if (byUrl.has(entry.url)) throw new Error(`duplicate golden url ${entry.url}`);
            const commentList: GoldenComment[] = [];
            for (const comment of entry.comments ?? []) {
                if (!comment.comment) continue;
                commentList.push({
                    comment: comment.comment,
                    severity: comment.severity,
                    category: comment.category,
                });
                if (comment.category) categoryByComment.set(comment.comment, comment.category);
                commentCount++;
            }
            byUrl.set(entry.url, commentList);
        }
    }
    return { byUrl, categoryByComment, pullRequestCount: byUrl.size, commentCount };
}
