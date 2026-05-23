import { createNodeConfig } from "@proval/config/eslint/node";

export default createNodeConfig({
    ignores: ["dist/**"],
    tsconfigRootDir: import.meta.dirname,
});
