import js from "@eslint/js";
import ts from "typescript-eslint";

/** @type {import('eslint').Linter.RulesRecord} */
export const typedRules = {
    "@typescript-eslint/switch-exhaustiveness-check": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/prefer-optional-chain": "error",
};

/** @type {import('eslint').Linter.Config[]} */
export const baseConfigs = [
    js.configs.recommended,
    ...ts.configs.recommended,
    {
        rules: {
            "no-undef": "off",
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                },
            ],
            eqeqeq: ["error", "always", { null: "ignore" }],
            "no-console": ["warn"],
            "prefer-const": "error",
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-non-null-assertion": "warn",
        },
    },
];
