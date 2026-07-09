<script lang="ts">
    import { goto } from "$app/navigation";
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import RepositoryForm from "$lib/components/organism/RepositoryForm.svelte";
    import { openAlert, openConfirm } from "$lib/store/modal";
    import fetchApi from "$lib/utils";
    import type { PageProps } from "./$types";

    const { data }: PageProps = $props();

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
            goto("/repository");
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
        goto("/repository");
    }
</script>

<DefaultLayout narrow title="Config Repository">
    <RepositoryForm
        editRepositoryId={data.repository.id}
        modelList={data.modelList}
        repositoryList={data.repositoryList}
        provider={data.provider}
        config={{
            modelProviderId: data.repository.modelProviderId,
            modelName: data.repository.modelName,
            repositoryId:
                data.repository.provider === "github"
                    ? data.repository.githubRepositoryId
                    : data.repository.gitProviderRepositoryId,
            description: data.repository.description,
            language: data.repository.language,
            reviewOnPullRequestOpen: data.repository.reviewOnPullRequestOpen,
            inlineReview: data.repository.inlineReview,
            replyToPullRequestComment: data.repository.replyToPullRequestComment,
            replyToIssueComment: data.repository.replyToIssueComment,
            commentOnIssueOpen: data.repository.commentOnIssueOpen,
        }}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        onDelete={handleDelete} />
</DefaultLayout>
