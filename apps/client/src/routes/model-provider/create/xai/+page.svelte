<script lang="ts">
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import ModelXaiForm from "$lib/components/organism/ModelXaiForm.svelte";
</script>

<DefaultLayout narrow title="Create xAI Model Provider">
    <ModelXaiForm mode="create" />
</DefaultLayout>
