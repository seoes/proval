<script lang="ts">
    import markUrl from "@proval/brand/mark.svg";
    import { twMerge } from "tailwind-merge";

    let {
        class: className = "size-7",
        wordmark = false,
        wordmarkClass = "text-3xl font-semibold tracking-tight text-neutral-800",
    }: {
        class?: string;
        wordmark?: boolean;
        wordmarkClass?: string;
    } = $props();
</script>

{#if wordmark}
    <span class={twMerge("inline-flex items-center gap-2", wordmarkClass)}>
        <img src={markUrl} alt="" class={twMerge("inline-block shrink-0 rounded-md", className)} aria-hidden="true" />
        <span>Proval</span>
    </span>
{:else}
    <img src={markUrl} alt="" class={twMerge("inline-block rounded-md", className)} aria-hidden="true" />
{/if}
