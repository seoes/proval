export const FILE_COVERAGE_RULE = [
    "# File Coverage Rule",
    "",
    "You must inspect MOST changed files that are relevant to code review.",
    "Skip only files that are clearly not worth reviewing:",
    "- Lock files (package-lock.json, yarn.lock, pnpm-lock.yaml, poetry.lock, Cargo.lock, go.sum, etc.)",
    "- Generated files (*.generated.*, *.min.*, dist/, build/, node_modules/, __generated__/)",
    "- Binary files (images, fonts, compiled binaries, .ico, .png, .jpg, .gif, .woff, .woff2)",
    "- Pure configuration without logic (renovate.json, .gitignore, .editorconfig, .prettierrc, .eslintrc)",
    "",
    "When in doubt, inspect the file. Under-reviewing is worse than over-reviewing.",
].join("\n");
