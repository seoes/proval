import fetchApi from "$lib/utils";

export type RepositorySelectItem = {
    id: number;
    fullName: string;
    alreadyConnected?: boolean;
};

export type LoadRepositoryListInput =
    | { provider: "gitlab" | "forgejo"; accessId: number }
    | { provider: "github"; appId: number; installationId: number };

export async function loadRepositoryList(input: LoadRepositoryListInput): Promise<RepositorySelectItem[]> {
    try {
        if (input.provider === "github") {
            const res = await fetchApi(
                `/github/app/${input.appId}/installation/${input.installationId}/repository`,
            );
            if (!res.ok) {
                return [];
            }
            const list: { id: number; fullName: string; alreadyConnected: boolean }[] = await res.json();
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
        const list: { id: number; fullName: string; alreadyConnected?: boolean }[] = await res.json();
        return list.map((repo) => ({
            id: repo.id,
            fullName: repo.fullName,
            alreadyConnected: repo.alreadyConnected,
        }));
    } catch {
        return [];
    }
}
