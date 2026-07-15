<script lang="ts">
    import type { Snippet } from "svelte";
    import { twMerge } from "tailwind-merge";

    type Variant = "primary" | "secondary" | "ghost";

    interface Props {
        href: string;
        class?: string;
        variant?: Variant;
        children: Snippet;
        external?: boolean;
    }

    let { href, class: className, children, variant = "ghost", external = false }: Props = $props();

    const variantClass: Record<Variant, string> = {
        primary:
            "text-sm font-medium text-primary underline decoration-primary/35 underline-offset-[6px] transition-colors hover:decoration-primary",
        secondary: "text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-950",
        ghost: "text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-950",
    };
</script>

<a
    {href}
    class={twMerge(
        "inline-flex items-center gap-1 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        variantClass[variant],
        className,
    )}
    target={external ? "_blank" : undefined}
    rel={external ? "noopener noreferrer" : undefined}>
    {@render children()}
    {#if external}
        <svg aria-hidden="true" class="size-3.5 shrink-0 opacity-50" viewBox="0 0 16 16" fill="none">
            <path
                d="M5 3h8v8M13 3L6 10M13 3H9M13 3v4"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round" />
        </svg>
        <span class="sr-only">(opens in new tab)</span>
    {/if}
</a>
