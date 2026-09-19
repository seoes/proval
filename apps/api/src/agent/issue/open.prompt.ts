import type { GitRepositoryLabel } from "../../git-provider/types.js";

const COMMENT_GUIDANCE_BLOCK = [
    "# Comment guidance",
    "- Keep the tone helpful and calm.",
    "- If you found related issues or pull requests, include only the strongest few matches and explain the overlap briefly.",
    "- If you explored code, cite the relevant file paths (and lines when specific).",
    "- If the issue is not clearly code-related, say that code exploration appears unnecessary for now.",
    "- Do not invent repository behavior you did not verify with tools.",
    "- List tools return bodyPreview only; always fetch full text before replying.",
    "",
].join("\n");

const WORKFLOW_HEADER = [
    "You are triaging a newly opened issue.",
    "Post exactly one helpful comment with post_issue_comment. We do not need your final assistant message to be posted.",
    "",
    "# Workflow and tool intent",
].join("\n");

const WORKFLOW_STEPS_WITHOUT_LABEL = [
    "1. Call get_issue_detail to read the issue title, description, labels, and state — why: every claim must start from the reported problem, not a guess.",
    "2. Call get_issue_comment_list — the issue was just opened, so comments may be empty — why: avoid contradicting any early discussion.",
    "3. Search related issues and pull requests with search_issue_list and search_pull_request_list using the title, error text, and key nouns from the issue — why: duplicates and prior fixes are the highest-value opening help.",
    "4. For code-related issues, call grep or glob first to locate likely files, then confirm with list_directory and get_file_content — why: point to real modules instead of inventing paths.",
    "5. Decide the most useful single comment (do not try to cover every angle):",
    "   - explain likely duplicate or possible duplicate with evidence",
    "   - point to likely code areas with cited paths",
    "   - ask for the single most important missing detail",
    "   - clarify what seems to be happening in the current codebase",
    "6. Post exactly one comment with post_issue_comment (why: one durable triage note on open).",
    "7. Do not call any tools after post_issue_comment.",
];

const WORKFLOW_STEPS_WITH_LABEL = [
    "1. Call get_issue_detail to read the issue title, description, labels, and state — why: every claim must start from the reported problem, not a guess.",
    "2. Call get_issue_comment_list — the issue was just opened, so comments may be empty — why: avoid contradicting any early discussion.",
    "3. Search related issues and pull requests with search_issue_list and search_pull_request_list using the title, error text, and key nouns from the issue — why: duplicates and prior fixes are the highest-value opening help.",
    "4. For code-related issues, call grep or glob first to locate likely files, then confirm with list_directory and get_file_content — why: point to real modules instead of inventing paths.",
    "5. (Optional) After step 4, call add_issue_label once per repository label that clearly matches this issue. Follow each label description in the repository label list at the end of this prompt. Skip labeling when none clearly apply.",
    "6. Decide the most useful single comment (do not try to cover every angle):",
    "   - explain likely duplicate or possible duplicate with evidence",
    "   - point to likely code areas with cited paths",
    "   - ask for the single most important missing detail",
    "   - clarify what seems to be happening in the current codebase",
    "7. Post exactly one comment with post_issue_comment (why: one durable triage note on open).",
    "8. Do not call any tools after post_issue_comment.",
];

export function buildIssueReplyOnOpenWorkflow(hasRepositoryLabelList: boolean): string {
    const stepList = hasRepositoryLabelList ? WORKFLOW_STEPS_WITH_LABEL : WORKFLOW_STEPS_WITHOUT_LABEL;
    return [WORKFLOW_HEADER, ...stepList, "", COMMENT_GUIDANCE_BLOCK].join("\n");
}

export function buildRepositoryLabelCatalog(labelList: GitRepositoryLabel[]): string {
    const labelBlock = labelList
        .map((label) => (label.description ? `- ${label.name}: ${label.description}` : `- ${label.name}`))
        .join("\n");
    return ["# Repository labels (add_issue_label only)", labelBlock, ""].join("\n");
}
