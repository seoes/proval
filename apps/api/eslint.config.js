import { createNodeConfig } from "@proval/config/eslint/node";
import path from "node:path";

const gitignorePath = path.resolve(import.meta.dirname, ".gitignore");

export default createNodeConfig({
    gitignorePath,
    ignores: ["dist/**"],
    tsconfigRootDir: import.meta.dirname,
});
