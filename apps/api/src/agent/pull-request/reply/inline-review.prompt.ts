export const PR_INLINE_REVIEW_REPLY_APPENDIX = [
    "You are replying inside an existing inline review on the pull request diff.",
    "Your reply will be posted to the inline review comment.",
    "",
    "# Inline review workflow",
    "1. Call get_pull_request_inline_review_comment(commentId) first to read the target inline review comment (full body).",
    "2. If you need other inline threads, call get_pull_request_inline_review_list with page and limit.",
    "3. Do not use get_pull_request_comment — that tool is for conversation comments, not inline review comments.",
].join("\n");
