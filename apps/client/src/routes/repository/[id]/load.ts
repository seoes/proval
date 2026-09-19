import fetchApi from "$lib/utils";
import type {
    AccessResponse,
    ActivityResponse,
    GitHubAppResponse,
    GitHubInstallationResponse,
    ModelProviderResponse,
    ProviderOption,
    RepositoryResponse,
} from "@proval/types";
import { error } from "@sveltejs/kit";

export type RepositoryPageData = {
    repository: RepositoryResponse;
    modelList: ModelProviderResponse[];
    provider: ProviderOption;
};

async function resolveProviderForRepository(repository: RepositoryResponse): Promise<ProviderOption | null> {
    if (repository.provider === "github") {
        if (repository.githubInstallationId == null) {
            return null;
        }

        const appRes = await fetchApi("/github/app");
        if (!appRes.ok) {
            return null;
        }
        const appList: GitHubAppResponse[] = await appRes.json();
        const app = appList[0];
        if (!app) {
            return null;
        }

        const installationRes = await fetchApi(`/github/app/${app.id}/installation/${repository.githubInstallationId}`);
        if (!installationRes.ok) {
            return null;
        }
        const installation = (await installationRes.json()) as GitHubInstallationResponse | null;
        if (!installation) {
            return null;
        }

        return {
            type: "github",
            githubInstallationId: installation.id,
            label: installation.accountName,
        };
    }

    if (repository.gitProviderAccessId == null) {
        return null;
    }

    const accessRes = await fetchApi(`/access/${repository.gitProviderAccessId}`);
    if (!accessRes.ok) {
        return null;
    }
    const access: AccessResponse = await accessRes.json();

    return {
        type: access.provider,
        accessId: access.id,
        label: access.name,
        baseUrl: access.baseUrl,
    };
}

export async function loadRepositoryProvider(repositoryId: number): Promise<ProviderOption | null> {
    const repositoryResponse = await fetchApi(`/repository/${repositoryId}`);
    if (!repositoryResponse.ok) {
        return null;
    }
    const repository: RepositoryResponse = await repositoryResponse.json();
    return resolveProviderForRepository(repository);
}

export async function loadRepositoryPage(id: string): Promise<RepositoryPageData> {
    const [repositoryResponse, modelListResponse] = await Promise.all([
        fetchApi(`/repository/${id}`),
        fetchApi("/model-provider"),
    ]);

    if (!repositoryResponse.ok) {
        throw error(404, "Repository not found");
    }

    const repository: RepositoryResponse = await repositoryResponse.json();
    const modelList: ModelProviderResponse[] = modelListResponse.ok ? await modelListResponse.json() : [];
    const provider = await resolveProviderForRepository(repository);
    if (!provider) {
        throw error(400, "Git provider access is missing");
    }

    return {
        repository,
        modelList,
        provider,
    };
}

const VIEW_IN_PROVIDER_LABEL = {
    github: "View in GitHub",
    gitlab: "View in GitLab",
    forgejo: "View in Forgejo",
} as const;

export function viewInProviderLabel(provider: ActivityResponse["provider"]): string {
    return VIEW_IN_PROVIDER_LABEL[provider];
}

export function activityTargetWebUrl(
    activity: Pick<ActivityResponse, "provider" | "repositoryPath" | "type" | "targetIid">,
    providerOption: ProviderOption | null,
): string | null {
    const path = activity.repositoryPath.replace(/^\//, "");
    if (!path) {
        return null;
    }

    const isPullRequest = activity.type === "pr_review" || activity.type === "pr_reply";
    const target = activity.targetIid;

    if (activity.provider === "github") {
        return isPullRequest
            ? `https://github.com/${path}/pull/${target}`
            : `https://github.com/${path}/issues/${target}`;
    }

    if (!providerOption || providerOption.type === "github") {
        return null;
    }

    const base = providerOption.baseUrl.replace(/\/$/, "");

    if (activity.provider === "gitlab") {
        return isPullRequest
            ? `${base}/${path}/-/merge_requests/${target}`
            : `${base}/${path}/-/issues/${target}`;
    }

    return isPullRequest ? `${base}/${path}/pulls/${target}` : `${base}/${path}/issues/${target}`;
}
