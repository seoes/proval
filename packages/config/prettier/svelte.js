import base from './base.js';

/**
 * @param {{ tailwindStylesheet: string }} options
 * @returns {import('prettier').Config}
 */
export function createSveltePrettierConfig({ tailwindStylesheet }) {
    return {
        ...base,
        plugins: ['prettier-plugin-svelte', 'prettier-plugin-tailwindcss'],
        overrides: [
            {
                files: '*.svelte',
                options: {
                    parser: 'svelte'
                }
            }
        ],
        tailwindStylesheet
    };
}
