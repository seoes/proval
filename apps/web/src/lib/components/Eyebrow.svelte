<script lang="ts">
    import type { Snippet } from "svelte";
    import { twMerge } from "tailwind-merge";

    interface Props {
        class?: string;
        children: Snippet;
    }

    let { class: className, children }: Props = $props();
</script>

<p class={twMerge("font-mono text-xs font-medium tracking-widest text-neutral-500 uppercase", className)}>
    {@render children()}
</p>
