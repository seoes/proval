import { includeIgnoreFile } from "@eslint/compat";
import prettier from "eslint-config-prettier";
import svelte from "eslint-plugin-svelte";
import { defineConfig } from "eslint/config";
import globals from "globals";
import ts from "typescript-eslint";
import { baseConfigs, typedRules } from "./base.js";

/**
 * @param {{
 *   svelteConfig: import('@sveltejs/kit').Config;
 *   gitignorePath: string;
 *   ignores?: string[];
 *   tsconfigRootDir: string;
 * }} options
 */
export function createSvelteConfig({ svelteConfig, gitignorePath, ignores = [], tsconfigRootDir }) {
    return defineConfig(
        includeIgnoreFile(gitignorePath),
        ...(ignores.length ? [{ ignores }] : []),
        ...baseConfigs,
        ...svelte.configs.recommended,
        prettier,
        ...svelte.configs.prettier,
        {
            rules: {
                "svelte/no-navigation-without-resolve": "off",
                "svelte/require-each-key": "off",
                "svelte/prefer-svelte-reactivity": "error",
            },
        },
        {
            languageOptions: { globals: { ...globals.browser, ...globals.node } },
        },
        {
            files: ["**/*.{ts,tsx,mts,cts}"],
            languageOptions: {
                parserOptions: {
                    projectService: {
                        allowDefaultProject: ["*.config.ts"],
                    },
                    tsconfigRootDir,
                },
            },
            rules: typedRules,
        },
        {
            files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
            languageOptions: {
                parserOptions: {
                    projectService: {
                        allowDefaultProject: ["*.config.ts"],
                    },
                    tsconfigRootDir,
                    extraFileExtensions: [".svelte"],
                    parser: ts.parser,
                    svelteConfig,
                },
            },
            rules: typedRules,
        },
        {
            files: ["**/*.{js,mjs,cjs}"],
            extends: [ts.configs.disableTypeChecked],
        },
    );
}
