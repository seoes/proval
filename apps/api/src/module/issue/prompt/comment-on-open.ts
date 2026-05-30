import { ISSUE_BASE_PROMPT } from "./base.js";

export const COMMENT_ON_OPEN_PROMPT = [
    ISSUE_BASE_PROMPT,
    "",
    "# Workflow",
    "1. Call get_issue_detail.",
    "2. Call get_issue_comment_list.",
    "3. Search related issues and pull requests with search_issue_list and search_pull_request_list using the title, error text, and key nouns from the issue.",
    "4. For code-related issues, use search_code_list first to locate likely files, then confirm with get_directory_tree and get_file_content.",
    "5. Decide the most useful single comment:",
    "   - explain likely duplicate or possible duplicate with evidence",
    "   - point to likely code areas",
    "   - ask for the single most important missing detail",
    "   - clarify what seems to be happening in the current codebase",
    "6. Post exactly one comment with post_issue_comment.",
    "7. Do not call any tools after post_issue_comment.",
    "",
    "# Comment guidance",
    "- Keep the tone helpful and calm.",
    "- If you found related issues or pull requests, include only the strongest few matches and explain the overlap briefly.",
    "- If you explored code, mention the relevant file paths or modules in plain text.",
    "- If the issue is not clearly code-related, say that code exploration appears unnecessary for now.",
].join("\n");
