// scripts/export-bruno.ts
import { Hono } from "hono";
import { inspectRoutes } from "hono/dev";
import fs from "fs";
import path from "path";
import { apiApp } from "./src/app.js";

const COLLECTION_DIR = "./.bruno/api-collection";

function slugify(str: string): string {
    return (
        str
            .replace(/^\//, "")
            .replace(/[\/:{}]/g, "-")
            .replace(/-+/g, "-") || "root"
    );
}

function generateBruno(app: Hono) {
    fs.mkdirSync(COLLECTION_DIR, { recursive: true });

    // 1. collection.bru
    fs.writeFileSync(
        path.join(COLLECTION_DIR, "collection.bru"),
        `meta {
  name: API Collection
  type: collection
}

auth {
  mode: none
}
`,
    );

    // 2. environment
    const envDir = path.join(COLLECTION_DIR, "environments");
    fs.mkdirSync(envDir, { recursive: true });
    fs.writeFileSync(
        path.join(envDir, "local.bru"),
        `vars {
  baseUrl: http://localhost:3000
}
`,
    );

    // 3. 라우트 순회하며 .bru 파일 생성
    const routes = inspectRoutes(app);
    let seq = 1;

    for (const route of routes) {
        if (route.path === "/*") continue; // 404 핸들러 등 제외

        const method = route.method.toLowerCase();
        const name = `${route.method} ${route.path}`;
        const fileName = `${method}-${slugify(route.path)}.bru`;

        // body가 필요한 메서드인지
        const needsBody = ["post", "put", "patch"].includes(method);

        let bru = `meta {
  name: ${name}
  type: http
  seq: ${seq++}
}

${method} {
  url: {{baseUrl}}${route.path}
  body: ${needsBody ? "json" : "none"}
  auth: none
}
`;

        if (needsBody) {
            bru += `
headers {
  Content-Type: application/json
}

body:json {
  {
    // TODO: request body를 채워주세요
  }
}
`;
        }

        // 폴더 구조로 정리 (선택)
        // /users/:id → users/ 폴더 아래에 생성
        const segments = route.path.split("/").filter(Boolean);
        if (segments.length > 0 && !segments[0].startsWith(":")) {
            const folder = path.join(COLLECTION_DIR, segments[0]);
            fs.mkdirSync(folder, { recursive: true });
            fs.writeFileSync(path.join(folder, fileName), bru);
        } else {
            fs.writeFileSync(path.join(COLLECTION_DIR, fileName), bru);
        }
    }

    console.log(`✅ ${routes.length}개의 라우트가 ${COLLECTION_DIR}에 생성되었습니다.`);
}

generateBruno(apiApp);
