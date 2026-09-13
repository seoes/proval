export function isBotMentioned(body: string, aliasList: string[]): boolean {
    const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const stripCodeFromCommentBody = (text: string): string => {
        let stripped = text.replace(/```[\s\S]*?```/g, "");
        stripped = stripped.replace(/`[^`]*`/g, "");
        return stripped;
    };

    const aliasListFiltered = aliasList.map((alias) => alias.trim()).filter((alias) => alias.length > 0);
    if (aliasListFiltered.length === 0) {
        return false;
    }

    const searchable = stripCodeFromCommentBody(body);
    const escaped = aliasListFiltered.map(escapeRegExp).join("|");
    const pattern = new RegExp(`(^|[^A-Za-z0-9._-])@(${escaped})(?=$|[^A-Za-z0-9_-])`, "i");
    return pattern.test(searchable);
}
