import type { TestInput } from "../provider.js";

/** MR with prior discussion; use with MergeRequestService.reply() and a @test_bot mention. */
export const mentionReply: TestInput = {
    detail: {
        title: "refactor: extract validation helpers",
        description: "Moves zod schemas to shared module.",
        sourceBranch: "refactor/validation",
        targetBranch: "main",
        author: "dana",
        state: "opened",
    },
    diffs: [
        {
            oldPath: "src/validation/user.ts",
            newPath: "src/validation/user.ts",
            newFile: true,
            renamedFile: false,
            deletedFile: false,
            diff: `diff --git a/src/validation/user.ts b/src/validation/user.ts
new file mode 100644
index 0000000..8888888
--- /dev/null
+++ b/src/validation/user.ts
@@ -0,0 +1,6 @@
+import { z } from "zod";
+
+export const userSchema = z.object({
+  email: z.string().email(),
+});
+`,
        },
    ],
    currentUser: { username: "test_bot" },
    comments: [
        {
            id: 1,
            body: "Looks good overall.",
            author: "reviewer1",
            createdAt: "2025-01-02T10:00:00Z",
        },
        {
            id: 2,
            body: "@test_bot should we add max length on email in the schema?",
            author: "human_user",
            createdAt: "2025-01-02T11:00:00Z",
        },
    ],
};
