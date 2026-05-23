import js from "@eslint/js";
import ts from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
export const baseConfigs = [
    js.configs.recommended,
    ...ts.configs.recommended,
    {
        rules: {
            "prefer-const": "off",
            "no-undef": "off",
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    //     caughtErrorsIgnorePattern: '^_'
                },
            ],
            "@typescript-eslint/no-explicit-any": "off",
        },
    },
];
