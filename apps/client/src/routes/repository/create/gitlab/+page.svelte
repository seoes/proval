<script lang="ts">
    import DefaultLayout from '$lib/components/layout/DefaultLayout.svelte';
    import RepositoryForm from '$lib/components/organism/RepositoryForm.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
</script>

<DefaultLayout title="Create GitLab Repository">
    <RepositoryForm mode="create" provider="gitlab" modelList={data.modelList} />
</DefaultLayout>
