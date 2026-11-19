import {
    ArrowBendUpLeftIcon,
    ChatCircleTextIcon,
    ChatsCircleIcon,
    CheckCircleIcon,
    FileCodeIcon,
    FileMagnifyingGlassIcon,
    FilesIcon,
    FileXIcon,
    FolderOpenIcon,
    GitDiffIcon,
    GitPullRequestIcon,
    InfoIcon,
    MagnifyingGlassIcon,
    NotePencilIcon,
    PaperPlaneTiltIcon,
    ScalesIcon,
    StackPlusIcon,
    TagIcon,
    WrenchIcon,
    XCircleIcon,
} from "phosphor-svelte";

export const toolIconRecord: Record<string, typeof WrenchIcon> = {
    get_file_content: FileCodeIcon,
    list_directory: FolderOpenIcon,
    glob: FileMagnifyingGlassIcon,
    grep: MagnifyingGlassIcon,
    get_pull_request_detail: GitPullRequestIcon,
    get_changed_file_list: FilesIcon,
    get_file_diff: GitDiffIcon,
    get_push_changed_file_list: FilesIcon,
    get_push_file_diff: GitDiffIcon,
    get_pull_request_comment_list: ChatsCircleIcon,
    get_pull_request_comment: ChatCircleTextIcon,
    get_pull_request_inline_review_list: ChatsCircleIcon,
    get_pull_request_inline_review_comment: ChatCircleTextIcon,
    post_pull_request_comment: NotePencilIcon,
    post_reply_comment: ArrowBendUpLeftIcon,
    post_pull_request_inline_review_reply: ArrowBendUpLeftIcon,
    create_single_line_comment: NotePencilIcon,
    create_multi_line_comment: NotePencilIcon,
    evaluate_pull_request: ScalesIcon,
    approve_pull_request: CheckCircleIcon,
    unapprove_pull_request: XCircleIcon,
    append_review_unit: StackPlusIcon,
    skip_file: FileXIcon,
    submit_review_handoff: PaperPlaneTiltIcon,
    get_issue_detail: InfoIcon,
    get_issue_comment: ChatCircleTextIcon,
    get_issue_comment_list: ChatsCircleIcon,
    post_issue_comment: NotePencilIcon,
    post_issue_reply: ArrowBendUpLeftIcon,
    search_issue_list: MagnifyingGlassIcon,
    search_pull_request_list: MagnifyingGlassIcon,
    add_issue_label: TagIcon,
};

/**
 * Transform tool name from snake_case to human readable form
 */
export function transformToolName(snakeCasedToolName: string): string {
    const words = snakeCasedToolName.split("_");
    const parts: string[] = [];

    for (const word of words) {
        if (word.length === 0) continue;

        const firstChar = word[0].toUpperCase();
        parts.push(firstChar + word.substring(1));
    }

    return parts.join(" ");
}
