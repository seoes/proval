import { includeIgnoreFile } from '@eslint/compat';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import { baseConfigs } from './base.js';

/**
 * @param {{ gitignorePath?: string, ignores?: string[] }} [options]
 */
export function createNodeConfig({ gitignorePath, ignores = [] } = {}) {
    return defineConfig(
        ...(gitignorePath ? [includeIgnoreFile(gitignorePath)] : []),
        ...(ignores.length ? [{ ignores }] : []),
        ...baseConfigs,
        prettier,
        {
            languageOptions: { globals: globals.node }
        }
    );
}
