import { includeIgnoreFile } from "@eslint/compat";
import prettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import globals from "globals";
import ts from "typescript-eslint";
import { baseConfigs, typedRules } from "./base.js";

/**
 * @param {{
 *   gitignorePath?: string;
 *   ignores?: string[];
 *   tsconfigRootDir: string;
 * }} options
 */
export function createNodeConfig({ gitignorePath, ignores = [], tsconfigRootDir }) {
    return defineConfig(
        ...(gitignorePath ? [includeIgnoreFile(gitignorePath)] : []),
        ...(ignores.length ? [{ ignores }] : []),
        ...baseConfigs,
        prettier,
        {
            languageOptions: {
                globals: globals.node,
            },
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
            files: ["**/*.{js,mjs,cjs}"],
            extends: [ts.configs.disableTypeChecked],
        },
    );
}
