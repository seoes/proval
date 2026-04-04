import type { TestInput } from "../provider.js";

export const simpleBugfix: TestInput = {
    detail: {
        title: "fix: off-by-one in pagination",
        description: "Corrects page size when offset is zero.",
        sourceBranch: "fix/pagination-off-by-one",
        targetBranch: "main",
        author: "alice",
        state: "opened",
    },
    diffs: [
        {
            oldPath: "src/utils/pagination.ts",
            newPath: "src/utils/pagination.ts",
            newFile: false,
            renamedFile: false,
            deletedFile: false,
            diff: `diff --git a/src/utils/pagination.ts b/src/utils/pagination.ts
index 1111111..2222222 100644
--- a/src/utils/pagination.ts
+++ b/src/utils/pagination.ts
@@ -4,7 +4,7 @@ export function paginate<T>(items: T[], page: number, pageSize: number) {
   const safePage = Math.max(0, page);
   const start = safePage * pageSize;
-  const end = start + pageSize - 1;
+  const end = start + pageSize;
   return items.slice(start, end);
 }
`,
        },
    ],
    comments: [],
};
