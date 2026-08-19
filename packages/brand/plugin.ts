import { spawnSync } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const brandRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const iconDir = resolve(brandRoot, "icon");
const generateScript = resolve(brandRoot, "scripts/generate.ts");

export function brandIconPlugin() {
    let staticDir = resolve(process.cwd(), "static");
    return {
        name: "proval-brand-icon",
        configResolved(config: { root: string }) {
            staticDir = resolve(config.root, "static");
        },
        buildStart() {
            if (!existsSync(resolve(iconDir, "favicon.ico"))) {
                const result = spawnSync("bun", [generateScript], {
                    cwd: brandRoot,
                    stdio: "inherit",
                });
                if (result.status !== 0) {
                    throw new Error("Failed to generate brand icons");
                }
            }
            cpSync(iconDir, staticDir, { recursive: true });
        },
    };
}
