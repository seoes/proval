<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        children: Snippet;
        title: string;
        narrow?: boolean;
    }
    let { children, title, narrow = false }: Props = $props();
</script>

<div class="mx-auto {narrow ? 'max-w-lg' : 'max-w-6xl'}">
    <div>
        <h2 class="text-lg font-semibold">{title}</h2>
    </div>
    <div class="mt-8">
        {@render children?.()}
    </div>
</div>
