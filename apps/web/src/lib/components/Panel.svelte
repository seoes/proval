<script lang="ts">
    import type { Snippet } from "svelte";
    import { twMerge } from "tailwind-merge";

    interface Props {
        class?: string;
        children: Snippet;
        /** Extra padding around content. Default true. */
        padded?: boolean;
    }

    let { class: className, children, padded = true }: Props = $props();
</script>

<div
    class={twMerge(
        "relative overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]",
        padded && "p-5 md:p-6",
        className,
    )}>
    <div
        class="pointer-events-none absolute inset-x-6 top-0 z-10 h-px bg-linear-to-r from-transparent via-primary/30 to-transparent"
        aria-hidden="true">
    </div>
    {@render children()}
</div>
