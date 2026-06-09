<script lang="ts">
    import type { Snippet } from "svelte";
    import { twMerge } from "tailwind-merge";

    interface Props {
        class?: string;
        children: Snippet;
        wide?: boolean;
    }

    let { class: className, children, wide = false }: Props = $props();
</script>

<div class={twMerge("mx-auto w-full px-4", wide ? "max-w-6xl" : "max-w-3xl", className)}>
    {@render children()}
</div>
