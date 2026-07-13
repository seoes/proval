import fetchApi from "$lib/utils";
import type {
    AccessResponse,
    ActivitySummaryResponse,
    GitHubAppResponse,
    GitHubInstallationResponse,
    ModelProviderResponse,
    RepositoryResponse,
} from "@proval/types";
import type { PageLoad } from "./$types";

const emptyActivitySummary: ActivitySummaryResponse = {
    range: "24h",
    stats: { totalActivity: 0, errors: 0, reviews: 0, replies: 0 },
    recent: [],
    tokenSeries: [],
    tokensByModel: [],
    tokensByRepository: [],
    inProgress: [],
};

export const load: PageLoad = async () => {
    const [modelResponse, repositoryResponse, accessResponse, githubAppResponse, activitySummaryResponse] =
        await Promise.all([
            fetchApi("/model-provider"),
            fetchApi("/repository"),
            fetchApi("/access"),
            fetchApi("/github/app"),
            fetchApi("/activity/summary?range=24h"),
        ]);

    const modelList: ModelProviderResponse[] = modelResponse.ok ? await modelResponse.json() : [];
    const repositoryList: RepositoryResponse[] = repositoryResponse.ok ? await repositoryResponse.json() : [];
    const accessList: AccessResponse[] = accessResponse.ok ? await accessResponse.json() : [];
    const githubAppList: GitHubAppResponse[] = githubAppResponse.ok ? await githubAppResponse.json() : [];

    let installationList: GitHubInstallationResponse[] = [];
    if (githubAppList.length > 0) {
        const installationResponse = await fetchApi(`/github/app/${githubAppList[0].id}/installation`);
        installationList = installationResponse.ok ? await installationResponse.json() : [];
    }

    const activitySummary: ActivitySummaryResponse = activitySummaryResponse.ok
        ? await activitySummaryResponse.json()
        : emptyActivitySummary;

    return {
        modelList,
        repositoryList,
        accessList,
        installationList,
        activitySummary,
    };
};
