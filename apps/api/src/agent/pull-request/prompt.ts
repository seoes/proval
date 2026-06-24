import type { GitProvider } from "../../git-provider/types";

export async function generatePullRequestPrompt(provider: GitProvider, prIid: number): Promise<string> {
    const version = await provider.fetchPullRequestVersion(prIid);
    const changedFileList = await provider.fetchChangedFileList(prIid);

    return [
        `Pull request version: ${JSON.stringify(version)}`,
        `Changed files: ${changedFileList
            .map((d) => d.newPath ?? d.oldPath)
            .filter((path) => path !== null)
            .join(", ")}`,
    ].join("\n\n");
}
