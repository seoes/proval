// Copied verbatim from withmartian/code-review-benchmark (MIT).
// Doubled braces are Python format escapes. formatPrompt renders them.

export const EXTRACT_SYSTEM = "You extract code review issues from comments. Always respond with valid JSON.";

export const DEDUP_SYSTEM = "You group duplicate code review comments. Always respond with valid JSON only.";

export const JUDGE_SYSTEM = "You are a precise code review evaluator. Always respond with valid JSON.";

export const EXTRACT_PROMPT =
    'You are analyzing an AI code review comment to extract individual issues mentioned.\n\nThe comment may discuss multiple distinct problems. Extract each separate issue as a standalone item.\n\nCode Review Comment:\n{comment}\n\nInstructions:\n- Extract each distinct code issue, bug, or concern mentioned\n- Each issue should be a single, specific problem (not a general observation)\n- Ignore meta-commentary like "I found 2 issues" - extract the actual issues\n- Ignore sign-offs, greetings, or formatting instructions\n- If the comment contains no actionable code review issues, return an empty list\n\nExample input:\n"Found several problems: 1) The getUserById function doesn\'t handle null input, which will cause a crash.\n2) The cache key uses user.name but should use user.id for uniqueness.\nAlso, consider adding retry logic for the API call."\n\nExample output:\n{{"issues": [\n  "getUserById function doesn\'t handle null input, causing potential crash",\n  "Cache key uses user.name instead of user.id, breaking uniqueness",\n  "Missing retry logic for API call"\n]}}\n\nRespond with ONLY a JSON object:\n{{"issues": ["issue 1", "issue 2", ...]}}';

export const DEDUP_PROMPT =
    'You are identifying duplicate code review comments.\n\nBelow is a numbered list of issues extracted from an AI tool\'s code review.\nSome tools post the same issue in both a summary comment and an inline comment,\ncreating near-identical duplicates. Your job is to find those duplicates.\n\nTwo candidates are duplicates ONLY IF:\n- They describe the same problem AND\n- A single code change would fix both (i.e., they would be one bug report)\n\nTwo candidates are NOT duplicates if:\n- They describe the same TYPE of bug but in different files, functions, or\n  classes (e.g., "negative slicing in OptimizedCursorPaginator" vs "negative\n  slicing in BasePaginator" are separate issues — fixing one does not fix\n  the other)\n- They describe related but distinct problems (e.g., "returns wrong type" vs\n  "caller crashes because of wrong type" are separate issues)\n\nWhen in doubt, keep candidates separate — it is better to leave a duplicate\nungrouped than to incorrectly merge two distinct issues.\n\nCandidates:\n{candidates}\n\nReturn ONLY a JSON object where each group is a list of 0-based indices.\nSingletons (no duplicate) must still appear as single-element groups.\n\nExample for 4 candidates where 0 and 2 are duplicates:\n{{"groups": [[0, 2], [1], [3]]}}\n\nYour response:';

export const JUDGE_PROMPT =
    'You are evaluating AI code review tools.\nDetermine if the candidate issue matches the golden (expected) comment.\n\nGolden Comment (the issue we\'re looking for):\n{golden_comment}\n\nCandidate Issue (from the tool\'s review):\n{candidate}\n\nInstructions:\n- Determine if the candidate identifies the SAME underlying issue as the golden comment\n- Accept semantic matches - different wording is fine if it\'s the same problem\n- Focus on whether they point to the same bug, concern, or code issue\n\nRespond with ONLY a JSON object:\n{{"reasoning": "brief explanation", "match": true/false, "confidence": 0.0-1.0}}';

/** Python str.format for the copied templates. Only named placeholders are replaced. */
export function formatPrompt(template: string, valueByName: Record<string, string>): string {
    let out = "";
    for (let index = 0; index < template.length; index++) {
        const char = template[index];
        const next = template[index + 1];
        if (char === "{" && next === "{") {
            out += "{";
            index++;
            continue;
        }
        if (char === "}" && next === "}") {
            out += "}";
            index++;
            continue;
        }
        if (char === "{") {
            const end = template.indexOf("}", index);
            if (end < 0) throw new Error("unclosed prompt placeholder");
            const name = template.slice(index + 1, end);
            const value = valueByName[name];
            if (value === undefined) throw new Error(`missing prompt placeholder ${name}`);
            out += value;
            index = end;
            continue;
        }
        out += char;
    }
    return out;
}
