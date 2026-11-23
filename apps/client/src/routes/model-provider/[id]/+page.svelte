<script lang="ts">
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import ModelAPIForm from "$lib/components/organism/ModelAPIForm.svelte";
    import ModelOAuthForm from "$lib/components/organism/ModelOAuthForm.svelte";
    import type { PageProps } from "./$types";

    let { data }: PageProps = $props();
</script>

<DefaultLayout narrow title="Config Model Provider">
    {#if data.modelProvider.authMethod !== "api_key"}
        <ModelOAuthForm
            authMethod={data.modelProvider.authMethod}
            mode="edit"
            modelProviderId={data.modelProvider.id}
            initialData={data.modelProvider} />
    {:else}
        <ModelAPIForm mode="edit" modelProviderId={data.modelProvider.id} initialData={data.modelProvider} />
    {/if}
</DefaultLayout>
