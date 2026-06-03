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
        primary: "font-semibold text-primary hover:text-primary/80 hover:underline underline-offset-4",
        secondary: "font-medium text-neutral-500 hover:text-neutral-800 hover:underline underline-offset-4",
        ghost: "text-neutral-500 hover:text-neutral-800 hover:underline underline-offset-4",
    };
</script>

<a
    {href}
    class={twMerge(
        "inline-flex items-center gap-1 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        variantClass[variant],
        className,
    )}
    target={external ? "_blank" : undefined}
    rel={external ? "noopener noreferrer" : undefined}>
    {@render children()}
    {#if external}
        <span aria-hidden="true" class="text-xs opacity-60">↗</span>
    {/if}
</a>
