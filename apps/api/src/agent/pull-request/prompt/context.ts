import type { GitPullRequestVersion } from "../../../git-provider/types.js";
import type { Workspace } from "../../../git-provider/workspace.js";

const CHANGED_FILES_PROMPT_CAP = 80;

export async function generatePullRequestPrompt(
    workspace: Workspace,
    prIid: number,
    version: GitPullRequestVersion,
    previousHeadSha?: string | null,
): Promise<string> {
    const changedFileList = await workspace.changedFiles();
    const rootDirectoryTree = await workspace.list("");

    const paths = changedFileList.map((d) => d.newPath || d.oldPath).filter((path) => path !== "");
    const listedPaths =
        paths.length > CHANGED_FILES_PROMPT_CAP
            ? `${paths.slice(0, CHANGED_FILES_PROMPT_CAP).join(", ")} … (+${paths.length - CHANGED_FILES_PROMPT_CAP} more; call get_changed_file_list for the full list)`
            : paths.join(", ");

    const shaLineList = [
        `head   ${version.headSha}  checkout, get_file_content / grep / glob / list`,
        `start  ${version.startSha}  get_file_diff / get_changed_file_list default (PR, against=start)`,
        `base   ${version.baseSha}  get_file_diff / get_changed_file_list against=base (merge target tip). Inline comment SHAs are host filled, do not pass`,
    ];
    if (previousHeadSha) {
        shaLineList.push(`previous ${previousHeadSha}  get_push_file_diff / get_push_changed_file_list`);
    }

    return [
        "# Workspace rules and tool intent",
        "- The workspace is a **head-only** snapshot of this PR. There is no base tree checkout.",
        "- Call `get_file_diff` on candidate paths first (default against=start: the PR change). Use against=base only to compare against the current merge target. Inline comments must use start hunks.",
        "- On a follow-up push review, prefer `get_push_file_diff` / `get_push_changed_file_list` for this push, and use full-PR diff tools only for regression or boundary checks.",
        "- Call `get_file_content` / `grep` / `glob` / `list_directory` only for **head** context (callers, contracts, surrounding lines, imports) after you have a specific suspicion from the diff (why: avoid dumping the repo into context).",
        "- Deleted paths: rely on diff hunks only — the file will not exist in the workspace.",
        "- Do not dump the whole repository into context.",
        "- When stating a claim about code, cite the exact file path and line you inspected.",
        `PR #${prIid}`,
        "# Commit SHAs (host managed, do not pass to tools)",
        ...shaLineList,
        `Changed files (${paths.length}): ${listedPaths || "(none)"}`,
        `Root directory listing (non-recursive): ${rootDirectoryTree.map((d) => d.name).join(", ")}`,
        "",
    ].join("\n");
}
