import fetchApi from "$lib/utils";
import type {
    GitHubRepositoryResponse,
    GitProviderRepositoryListResponse,
    LoadRepositoryListInput,
    RepositorySelectItem,
} from "@proval/types";

export async function loadRepositoryList(input: LoadRepositoryListInput): Promise<RepositorySelectItem[]> {
    try {
        if (input.provider === "github") {
            const res = await fetchApi(
                `/github/app/${input.appId}/installation/${input.installationId}/repository`,
            );
            if (!res.ok) {
                return [];
            }
            const list: GitHubRepositoryResponse[] = await res.json();
            return list.map((repo) => ({
                id: repo.id,
                fullName: repo.fullName,
                alreadyConnected: repo.alreadyConnected,
            }));
        }

        const res = await fetchApi(`/access/${input.accessId}/repository`);
        if (!res.ok) {
            return [];
        }
        const list: GitProviderRepositoryListResponse[] = await res.json();
        return list.map((repo) => ({
            id: repo.id,
            fullName: repo.fullName,
            alreadyConnected: repo.alreadyConnected,
        }));
    } catch {
        return [];
    }
}
