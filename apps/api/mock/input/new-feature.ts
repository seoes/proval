import type { TestInput } from "../provider.js";

export const newFeature: TestInput = {
    detail: {
        title: "feat: add user greeting API",
        description: "Adds GET /api/hello?name= that returns a JSON greeting.",
        sourceBranch: "feat/hello-api",
        targetBranch: "main",
        author: "bob",
        state: "opened",
    },
    diffs: [
        {
            oldPath: "src/routes/hello.ts",
            newPath: "src/routes/hello.ts",
            newFile: true,
            renamedFile: false,
            deletedFile: false,
            diff: `diff --git a/src/routes/hello.ts b/src/routes/hello.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/routes/hello.ts
@@ -0,0 +1,12 @@
+import { Hono } from "hono";
+
+const app = new Hono();
+
+app.get("/hello", (c) => {
+  const name = c.req.query("name") ?? "world";
+  return c.json({ message: \`Hello, \${name}!\` });
+});
+
+export default app;
+`,
        },
        {
            oldPath: "src/index.ts",
            newPath: "src/index.ts",
            newFile: false,
            renamedFile: false,
            deletedFile: false,
            diff: `diff --git a/src/index.ts b/src/index.ts
index 4444444..5555555 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,7 @@
 import { Hono } from "hono";
+import hello from "./routes/hello.js";
 
 const app = new Hono();
+app.route("/api", hello);
 
 export default app;
`,
        },
    ],
    files: {
        "src/routes/hello.ts": `import { Hono } from "hono";

const app = new Hono();

app.get("/hello", (c) => {
  const name = c.req.query("name") ?? "world";
  return c.json({ message: \`Hello, \${name}!\` });
});

export default app;
`,
        "src/index.ts": `import { Hono } from "hono";
import hello from "./routes/hello.js";

const app = new Hono();
app.route("/api", hello);

export default app;
`,
    },
    tree: [
        { id: "a", name: "src", type: "tree", path: "src", mode: "040000" },
        { id: "b", name: "routes", type: "tree", path: "src/routes", mode: "040000" },
        { id: "c", name: "hello.ts", type: "blob", path: "src/routes/hello.ts", mode: "100644" },
        { id: "d", name: "index.ts", type: "blob", path: "src/index.ts", mode: "100644" },
    ],
    comments: [{ id: 1, body: "Nice split into a sub-app.", author: "carol", createdAt: "2025-01-01T00:00:00Z" }],
};
