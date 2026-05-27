<script lang="ts">
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import RepositoryForm from "$lib/components/organism/RepositoryForm.svelte";
    import type { PageProps } from "./$types";

    let { data }: PageProps = $props();
</script>

<DefaultLayout narrow title="Config Repository">
    <RepositoryForm
        mode="edit"
        repositoryId={data.repository.id}
        provider={data.repository.provider}
        modelList={data.modelList}
        accessList={data.accessList}
        installationList={data.installationList}
        githubAppId={data.githubApp?.id ?? null}
        initialData={data.repository} />
</DefaultLayout>
