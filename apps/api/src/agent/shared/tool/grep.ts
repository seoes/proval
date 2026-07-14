import type { AgentTool } from "../../llm/loop.js";
import type { Workspace } from "../../../git-provider/workspace.js";
import { UNTRUSTED_WARNING_TOOL_PROMPT } from "../prompt/untrusted-warning.prompt.js";

export function grepTool(workspace: Workspace): AgentTool {
    return {
        name: "grep",
        description: [
            "Search file contents in the checked-out workspace with ripgrep.",
            "Prefer a single symbol or keyword per call.",
            "Optional glob filters files (e.g. *.{ts,tsx,css}).",
            "Returns matching paths with line numbers and snippets (max 50).",
            UNTRUSTED_WARNING_TOOL_PROMPT,
        ].join(" "),
        untrustedResult: true,
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Text or regex to search for.",
                },
                glob: {
                    type: "string",
                    description: "Optional file glob filter.",
                },
            },
            required: ["query"],
        },
        execute: async (args) => {
            const query = String(args.query);
            const glob = args.glob !== undefined ? String(args.glob) : undefined;
            const matches = await workspace.grep(query, { glob });
            return {
                matches,
                message:
                    matches.length >= 50
                        ? "Found many matches. Returned the first 50."
                        : `Found ${matches.length} matches.`,
            };
        },
    };
}
