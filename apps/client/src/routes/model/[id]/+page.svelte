<script lang="ts">
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import ModelForm from "$lib/components/organism/ModelForm.svelte";
    import type { PageProps } from "./$types";

    let { data }: PageProps = $props();
</script>

<DefaultLayout narrow title="Config Model">
    <ModelForm mode="edit" modelId={data.model.id} initialData={data.model} />
</DefaultLayout>
