<script lang="ts">
    import type { Snippet } from "svelte";
    import { twMerge } from "tailwind-merge";

    interface Props {
        type?: "button" | "submit" | "reset";
        class?: string;
        href?: string;
        onclick?: () => void;
        children: Snippet;
        primary?: boolean;
        secondary?: boolean;
        text?: boolean;
        disabled?: boolean;
        size?: "sm" | "md";
    }

    let {
        type = "button",
        class: className,
        href,
        onclick,
        children,
        primary = false,
        secondary = false,
        text = false,
        disabled = false,
        size = "md",
    }: Props = $props();

    let buttonClass = $derived(
        twMerge(
            "inline-flex cursor-pointer items-center justify-center rounded-lg text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:outline-none",
            size === "md" && "h-10",
            size === "sm" && "h-8",
            !text && size === "md" && "px-4",
            !text && size === "sm" && "px-3",
            text && "w-auto px-0",
            primary && "bg-primary text-white hover:bg-primary/90",
            secondary && "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50",
            text && "text-neutral-500 hover:text-neutral-700",
            disabled && "pointer-events-none opacity-50",
        ),
    );
</script>

{#if href}
    <a {href} class={twMerge(buttonClass, className)} aria-disabled={disabled}>{@render children()}</a>
{:else}
    <button {type} class={twMerge(buttonClass, className)} {onclick} {disabled}>{@render children()}</button>
{/if}
