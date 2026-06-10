export function buildCommentToolLanguageNote(language: string): string {
    return `Required comment language: ${language}. The body argument MUST be written entirely in ${language}; do not use any other language for user-visible text.`;
}

export function buildCommentBodyDescription(language: string): string {
    return `Markdown body in ${language} only — this is mandatory. Every sentence must be ${language}; do not mix other languages. Code identifiers, file paths, and symbols may remain unchanged.`;
}
