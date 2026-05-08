<script lang="ts">
    import DefaultLayout from '$lib/components/layout/DefaultLayout.svelte';
    import RepositoryForm from '$lib/components/organism/RepositoryForm.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
</script>

<DefaultLayout narrow title="Config Repository">
    <RepositoryForm
        mode="edit"
        repositoryId={data.repository.id}
        modelList={data.modelList}
        initialData={{
            name: data.repository.name,
            provider: data.repository.provider,
            baseUrl: data.repository.baseUrl,
            gitlabAccessToken: '',
            webhookSecret: '',
            botUsername: data.repository.botUsername ?? '',
            language: data.repository.language,
            gitlabRepositoryId: data.repository.gitlabRepositoryId,
            githubRepositoryPath: data.repository.githubRepositoryPath ?? '',
            githubRepositoryId: data.repository.githubRepositoryId ?? null,
            modelId: data.repository.modelId,
            reviewOnMergeRequestOpen: data.repository.reviewOnMergeRequestOpen,
            commentOnIssueOpen: data.repository.commentOnIssueOpen,
            replyToMergeRequestComment: data.repository.replyToMergeRequestComment,
            replyToIssueComment: data.repository.replyToIssueComment,
            inlineReview: data.repository.inlineReview,
            deepResearchOnMergeRequest: data.repository.deepResearchOnMergeRequest
        }}
    />
</DefaultLayout>
