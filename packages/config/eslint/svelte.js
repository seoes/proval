import { includeIgnoreFile } from '@eslint/compat';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import { baseConfigs } from './base.js';

/**
 * @param {{ svelteConfig: import('@sveltejs/kit').Config, gitignorePath: string, ignores?: string[] }} options
 */
export function createSvelteConfig({ svelteConfig, gitignorePath, ignores = [] }) {
    return defineConfig(
        includeIgnoreFile(gitignorePath),
        ...(ignores.length ? [{ ignores }] : []),
        ...baseConfigs,
        ...svelte.configs.recommended,
        prettier,
        ...svelte.configs.prettier,
        {
            rules: {
                'svelte/no-navigation-without-resolve': 'off',
                'svelte/require-each-key': 'off'
            }
        },
        {
            languageOptions: { globals: { ...globals.browser, ...globals.node } }
        },
        {
            files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
            languageOptions: {
                parserOptions: {
                    projectService: true,
                    extraFileExtensions: ['.svelte'],
                    parser: ts.parser,
                    svelteConfig
                }
            }
        }
    );
}
