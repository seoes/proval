export const PR_INLINE_REVIEW_REPLY_APPENDIX = [
    "You are replying inside an existing inline review on the pull request diff.",
    "Your reply will be posted to the inline review comment.",
    "",
    "# Inline review workflow and tool intent",
    "1. Call get_pull_request_inline_review_comment(commentId) first to read the target inline review comment (full body) — why: conversation comment tools will not return this thread.",
    "2. If you need other inline threads, call get_pull_request_inline_review_list with page and limit — why: context from sibling inline notes without leaving the diff discussion.",
    "3. Do not use get_pull_request_comment — that tool is for conversation comments, not inline review comments.",
    "4. When your reply refers to code, cite the exact file path and line (usually the inline anchor plus any related path you verified with get_file_diff / get_file_content).",
].join("\n");
