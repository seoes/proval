import type { TestInput } from "../provider.js";

export const securityIssue: TestInput = {
    detail: {
        title: "feat: user lookup by email",
        description: "Adds admin endpoint to find users.",
        sourceBranch: "feat/user-lookup",
        targetBranch: "main",
        author: "eve",
        state: "opened",
    },
    diffs: [
        {
            oldPath: "src/db/users.ts",
            newPath: "src/db/users.ts",
            newFile: false,
            renamedFile: false,
            deletedFile: false,
            diff: `diff --git a/src/db/users.ts b/src/db/users.ts
index 6666666..7777777 100644
--- a/src/db/users.ts
+++ b/src/db/users.ts
@@ -10,3 +10,8 @@ export async function getUserById(id: string) {
   return db.query("SELECT * FROM users WHERE id = ?", [id]);
 }
+
+export async function getUserByEmail(email: string) {
+  const q = "SELECT * FROM users WHERE email = '" + email + "'";
+  return db.rawQuery(q);
+}
`,
        },
    ],
    comments: [],
};
