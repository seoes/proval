import { createNodeConfig } from "@proval/config/eslint/node";

export default createNodeConfig({
    ignores: ["dist/**", "src/migration/**"],
    tsconfigRootDir: import.meta.dirname,
});
