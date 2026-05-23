import { createSvelteConfig } from "@code-review/config/eslint/svelte";
import path from "node:path";
import svelteConfig from "./svelte.config.js";

const gitignorePath = path.resolve(import.meta.dirname, ".gitignore");

export default createSvelteConfig({
    svelteConfig,
    gitignorePath,
    ignores: ["dist/**"],
});
