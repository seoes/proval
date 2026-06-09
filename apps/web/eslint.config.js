import { createSvelteConfig } from "@proval/config/eslint/svelte";
import { defineConfig } from "eslint/config";
import path from "node:path";
import svelteConfig from "./svelte.config.js";

const gitignorePath = path.resolve(import.meta.dirname, ".gitignore");

export default defineConfig(
    ...createSvelteConfig({
        svelteConfig,
        gitignorePath,
        ignores: ["dist/**"],
        tsconfigRootDir: import.meta.dirname,
    }),
    {
        rules: {
            "svelte/no-at-html-tags": "off",
        },
    },
);
