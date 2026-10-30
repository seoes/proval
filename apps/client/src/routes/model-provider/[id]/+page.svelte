<script lang="ts">
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import ModelAPIForm from "$lib/components/organism/ModelAPIForm.svelte";
    import ModelXaiForm from "$lib/components/organism/ModelXaiForm.svelte";
    import type { PageProps } from "./$types";

    let { data }: PageProps = $props();
</script>

<DefaultLayout narrow title="Config Model Provider">
    {#if data.modelProvider.authMethod === "xai_oauth"}
        <ModelXaiForm mode="edit" modelProviderId={data.modelProvider.id} initialData={data.modelProvider} />
    {:else}
        <ModelAPIForm mode="edit" modelProviderId={data.modelProvider.id} initialData={data.modelProvider} />
    {/if}
</DefaultLayout>
