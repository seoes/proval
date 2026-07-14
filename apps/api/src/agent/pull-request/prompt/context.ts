import type { Workspace } from "../../../git-provider/workspace.js";

const CHANGED_FILES_PROMPT_CAP = 80;

export async function generatePullRequestPrompt(workspace: Workspace, prIid: number, headSha: string): Promise<string> {
    const changedFileList = await workspace.changedFiles();
    const rootDirectoryTree = await workspace.list("");

    const paths = changedFileList.map((d) => d.newPath || d.oldPath).filter((path) => path !== "");
    const listedPaths =
        paths.length > CHANGED_FILES_PROMPT_CAP
            ? `${paths.slice(0, CHANGED_FILES_PROMPT_CAP).join(", ")} … (+${paths.length - CHANGED_FILES_PROMPT_CAP} more; call get_changed_file_list for the full list)`
            : paths.join(", ");

    return [
        "# Workspace rules",
        "- The workspace is a **head-only** snapshot of this PR. There is no base tree checkout.",
        "- Primary evidence for what changed: call `get_file_diff` on candidate paths.",
        "- Use `get_file_content` / `grep` / `glob` / `list_directory` only for **head** context (callers, contracts, surrounding lines) after you have a specific suspicion from the diff.",
        "- Deleted paths: rely on diff hunks only — the file will not exist in the workspace.",
        "- Do not dump the whole repository into context.",
        `PR #${prIid}`,
        `Head SHA: ${headSha}`,
        `Changed files (${paths.length}): ${listedPaths || "(none)"}`,
        `Root directory listing (non-recursive): ${rootDirectoryTree.map((d) => d.name).join(", ")}`,
        "",
    ].join("\n");
}
