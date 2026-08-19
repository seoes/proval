import { spawnSync } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const brandRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const iconDir = resolve(brandRoot, "icon");
const generateScript = resolve(brandRoot, "scripts/generate.ts");

export function brandIconPlugin() {
    return {
        name: "proval-brand-icon",
        async buildStart() {
            if (!existsSync(resolve(iconDir, "favicon.ico"))) {
                const result = spawnSync("bun", [generateScript], {
                    cwd: brandRoot,
                    stdio: "inherit",
                });
                if (result.status !== 0) {
                    throw new Error("Failed to generate brand icons");
                }
            }
            if (!existsSync(resolve(iconDir, "favicon.ico"))) {
                throw new Error(`Brand icons missing at ${iconDir}`);
            }
            const staticDir = resolve(process.cwd(), "static");
            cpSync(iconDir, staticDir, { recursive: true });
        },
    };
}
