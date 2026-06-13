export const COMMENT_LANGUAGE_RULE = [
    "# Comment Language",
    "",
    "You MUST write all user-visible text posted through comment tools in the language required by each tool's body parameter description.",
    "Do not mix languages in comment bodies. Code identifiers, file paths, and symbols may stay as-is.",
].join("\n");

export function buildCommentToolLanguageNote(language: string): string {
    return `Required comment language: ${language}. The body argument MUST be written entirely in ${language}; do not use any other language for user-visible text.`;
}

export function buildCommentBodyDescription(language: string): string {
    return `Markdown body in ${language} only — this is mandatory. Every sentence must be ${language}; do not mix other languages. Code identifiers, file paths, and symbols may remain unchanged.`;
}
