<script lang="ts">
    import { goto } from "$app/navigation";
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import RepositoryForm from "$lib/components/organism/RepositoryForm.svelte";
    import { openAlert, openConfirm } from "$lib/store/modal";
    import fetchApi from "$lib/utils";
    import { loadGitAccessRepositoryList, loadGitHubInstallationRepositoryList } from "$lib/utils/repository-list";
    import type { RepositorySelectItem } from "@proval/types";
    import { onMount } from "svelte";
    import type { PageProps } from "./$types";

    const { data }: PageProps = $props();

    const storedGitHostId =
        data.repository.provider === "github"
            ? data.repository.githubRepositoryId
            : data.repository.gitProviderRepositoryId;

    const storedRepositoryItem: RepositorySelectItem | null =
        storedGitHostId != null ? { id: storedGitHostId, path: data.repository.path, isConnected: true } : null;

    let repositoryList = $state<RepositorySelectItem[]>(storedRepositoryItem ? [storedRepositoryItem] : []);
    let isLoadingRepositoryList = $state(true);

    onMount(() => {
        void (async () => {
            isLoadingRepositoryList = true;
            try {
                let liveList: RepositorySelectItem[] = [];
                if (data.repository.provider === "github") {
                    if (data.repository.githubInstallationId == null) {
                        return;
                    }
                    liveList = await loadGitHubInstallationRepositoryList(data.repository.githubInstallationId);
                } else if (data.repository.gitProviderAccessId != null) {
                    liveList = await loadGitAccessRepositoryList(data.repository.gitProviderAccessId);
                }

                if (storedRepositoryItem && !liveList.some((item) => item.id === storedRepositoryItem.id)) {
                    repositoryList = [storedRepositoryItem, ...liveList];
                } else {
                    repositoryList = liveList;
                }
            } catch (error) {
                console.error("Failed to load repository list", error);
                await openAlert("Failed to load repository list");
            } finally {
                isLoadingRepositoryList = false;
            }
        })();
    });

    async function handleSubmit(body: Record<string, unknown>) {
        try {
            const response = await fetchApi(`/repository/${data.repository.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!response.ok) {
                const errBody = await response.json();
                if (errBody.error) {
                    throw new Error(errBody.error);
                }
                throw new Error("Failed to update repository");
            }
            await openAlert("Repository updated successfully");
            goto(`/repository/${data.repository.id}`);
        } catch (error) {
            console.error("Failed to update repository", error);
            await openAlert("Failed to update repository");
        }
    }

    async function handleDelete(repositoryId: number) {
        const confirmed = await openConfirm("Are you sure you want to delete this repository?");
        if (!confirmed) return;
        try {
            const response = await fetchApi(`/repository/${repositoryId}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
            });
            if (!response.ok) {
                const errBody = await response.json();
                if (errBody.error) {
                    throw new Error(errBody.error);
                }
                throw new Error(errBody.error ?? "Failed to delete repository");
            }
            await openAlert("Repository deleted successfully");
            goto("/repository");
        } catch (error) {
            console.error("Failed to delete repository", error);
            await openAlert("Failed to delete repository");
        }
    }

    function handleCancel() {
        goto(`/repository/${data.repository.id}`);
    }
</script>

<DefaultLayout narrow title="Config Repository">
    <RepositoryForm
        editRepositoryId={data.repository.id}
        modelList={data.modelList}
        {repositoryList}
        {isLoadingRepositoryList}
        provider={data.provider}
        config={{
            modelProviderId: data.repository.modelProviderId,
            modelName: data.repository.modelName,
            repositoryId: storedGitHostId,
            description: data.repository.description,
            language: data.repository.language,
            prEnabled: data.repository.prEnabled,
            prMinAccessLevel: data.repository.prMinAccessLevel,
            prReviewEnabled: data.repository.prReviewEnabled,
            prInlineReview: data.repository.prInlineReview,
            prReviewOnPush: data.repository.prReviewOnPush,
            prIgnoreDraft: data.repository.prIgnoreDraft,
            prReplyEnabled: data.repository.prReplyEnabled,
            prMentionOnly: data.repository.prMentionOnly,
            issueEnabled: data.repository.issueEnabled,
            issueMinAccessLevel: data.repository.issueMinAccessLevel,
            issueCommentOnOpenEnabled: data.repository.issueCommentOnOpenEnabled,
            issueLabelOnOpenEnabled: data.repository.issueLabelOnOpenEnabled,
            issueReplyEnabled: data.repository.issueReplyEnabled,
            issueMentionOnly: data.repository.issueMentionOnly,
        }}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        onDelete={handleDelete} />
</DefaultLayout>
