<script lang="ts">
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import ModelAPIForm from "$lib/components/organism/ModelAPIForm.svelte";
</script>

<DefaultLayout narrow title="Create OpenLLM Model Provider">
    <ModelAPIForm
        mode="create"
        initialData={{
            provider: "openai",
            label: "OpenLLM",
            baseUrl: "https://www.openllm.sh/v1",
            timeoutSecond: 600,
            requestConcurrency: null,
            activityConcurrency: null,
        }} />
</DefaultLayout>
