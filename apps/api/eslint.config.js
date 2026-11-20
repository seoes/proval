import { createNodeConfig } from "@proval/config/eslint/node";
import path from "node:path";

const gitignorePath = path.resolve(import.meta.dirname, ".gitignore");

export default [
    ...createNodeConfig({
        gitignorePath,
        ignores: ["dist/**", "benchmark/data/**"],
        tsconfigRootDir: import.meta.dirname,
    }),
    {
        files: ["benchmark/**"],
        rules: { "no-console": "off", "@typescript-eslint/no-non-null-assertion": "off" },
    },
];
