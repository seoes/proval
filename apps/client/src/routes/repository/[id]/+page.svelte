<script lang="ts">
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import RepositoryForm from "$lib/components/organism/RepositoryForm.svelte";
    import type { PageProps } from "./$types";

    const { data }: PageProps = $props();
</script>

<DefaultLayout narrow title="Config Repository">
    <RepositoryForm
        mode="edit"
        repository={data.repository}
        modelList={data.modelList}
        repositoryList={data.repositoryList}
        provider={data.provider} />
</DefaultLayout>
