export type AuthorMentionMode = "review" | "reply";

export function buildAuthorMentionPolicy(author: string, mode: AuthorMentionMode = "review"): string | null {
    const username = author.trim();
    if (!username) {
        return null;
    }

    if (mode === "reply") {
        return [
            `You are replying to ${username}. The reply tool prepends @${username} automatically.`,
            "Do not add another @mention in the body. Address them directly. Do not pick a different username from the thread.",
        ].join(" ");
    }

    return [
        `Author's name is ${username}. Mention the author's name at the start of your comment as @${username} once.`,
        "Use only this host provided username. Do not copy an example handle or pick a different username from the thread.",
        "Do not overuse.",
    ].join(" ");
}
