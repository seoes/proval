<script lang="ts" module>
    export type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "primary";
</script>

<script lang="ts">
    import type { Snippet } from "svelte";
    import { twMerge } from "tailwind-merge";

    interface Props {
        variant?: BadgeVariant;
        class?: string;
        children: Snippet;
    }

    const { variant = "neutral", class: className, children }: Props = $props();

    const variantClass: Record<BadgeVariant, string> = {
        neutral: "bg-neutral-100 text-neutral-600",
        success: "bg-emerald-50 text-emerald-700",
        warning: "bg-amber-50 text-amber-700",
        danger: "bg-red-50 text-red-700",
        primary: "bg-primary/10 text-primary",
    };
</script>

<span
    class={twMerge(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        variantClass[variant],
        className,
    )}>
    {@render children()}
</span>
