<script lang="ts">
    import DefaultLayout from '$lib/components/layout/DefaultLayout.svelte';
    import RepositoryForm from '$lib/components/organism/RepositoryForm.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
</script>

<DefaultLayout title="Create Forgejo Repository">
    <RepositoryForm mode="create" provider="forgejo" modelList={data.modelList} accessList={data.accessList} />
</DefaultLayout>
