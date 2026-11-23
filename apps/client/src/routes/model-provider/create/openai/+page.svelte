<script lang="ts">
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import ModelOAuthForm from "$lib/components/organism/ModelOAuthForm.svelte";
</script>

<DefaultLayout narrow title="Create OpenAI Model Provider">
    <ModelOAuthForm authMethod="openai_oauth" mode="create" />
</DefaultLayout>
