<script lang="ts">
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import ModelOAuthForm from "$lib/components/organism/ModelOAuthForm.svelte";
</script>

<DefaultLayout narrow title="Create xAI Model Provider">
    <ModelOAuthForm authMethod="xai_oauth" mode="create" />
</DefaultLayout>
