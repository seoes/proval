import base from "./base.js";
// Resolve plugins from this package. String plugin names are resolved from the
// consumer's cwd, which breaks format:check in apps/client and apps/web.
import sveltePlugin from "prettier-plugin-svelte";
import * as tailwindPlugin from "prettier-plugin-tailwindcss";

/**
 * @param {{ tailwindStylesheet: string }} options
 * @returns {import('prettier').Config}
 */
export function createSveltePrettierConfig({ tailwindStylesheet }) {
    return {
        ...base,
        plugins: [sveltePlugin, tailwindPlugin],
        overrides: [
            {
                files: "*.svelte",
                options: {
                    parser: "svelte",
                    htmlWhitespaceSensitivity: "ignore",
                },
            },
        ],
        tailwindStylesheet,
    };
}
