<script lang="ts">
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import ModelAPIForm from "$lib/components/organism/ModelAPIForm.svelte";
</script>

<DefaultLayout narrow title="Create API Key Model Provider">
    <ModelAPIForm mode="create" />
</DefaultLayout>
