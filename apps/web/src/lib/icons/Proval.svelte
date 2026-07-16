<script lang="ts">
    let { class: className = "size-4" }: { class?: string } = $props();
</script>

<span
    class="inline-flex items-center justify-center rounded-md bg-primary text-lg font-bold text-white {className}"
    aria-hidden="true">P</span>
