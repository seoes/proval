import type { GitProvider, GitTree } from "../../../git-provider/types";

export async function generatePullRequestPrompt(
    provider: GitProvider,
    prIid: number,
    ref: string,
    fileList: GitTree[],
): Promise<string> {
    const changedFileList = await provider.fetchChangedFileList(prIid);
    const rootDirectoryTree = fileList.filter((entry) => !entry.path.includes("/"));

    return [
        `Changed files: ${changedFileList
            .map((d) => d.newPath ?? d.oldPath)
            .filter((path) => path !== null)
            .join(", ")}`,
        `Root directory tree (Head SHA: ${ref}, No Recursive): ${rootDirectoryTree.map((d) => d.name).join(", ")}`,
    ].join("\n\n");
}
