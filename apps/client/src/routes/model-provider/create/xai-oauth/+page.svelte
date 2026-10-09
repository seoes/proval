<script lang="ts">
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import ModelForm from "$lib/components/organism/ModelForm.svelte";
</script>

<DefaultLayout narrow title="Create xAI OAuth Model Provider">
    <ModelForm mode="create" authMethod="xaiOauth" />
</DefaultLayout>
