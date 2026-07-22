<script lang="ts">
    import type { Snippet } from "svelte";
    import { twMerge } from "tailwind-merge";

    type Variant = "primary" | "secondary" | "ghost" | "segment";

    interface Props {
        type?: "button" | "submit" | "reset";
        class?: string;
        onclick?: () => void;
        variant?: Variant;
        pressed?: boolean;
        role?: string;
        id?: string;
        "aria-controls"?: string;
        "aria-selected"?: boolean;
        tabindex?: number;
        children: Snippet;
    }

    let {
        type = "button",
        class: className,
        onclick,
        children,
        variant = "primary",
        pressed = false,
        role,
        id,
        "aria-controls": ariaControls,
        "aria-selected": ariaSelected,
        tabindex,
    }: Props = $props();

    const buttonClass = $derived(
        twMerge(
            "inline-flex cursor-pointer items-center justify-center rounded-lg text-sm font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50",
            variant === "segment" ? "h-8 px-3.5" : "h-10 px-5",
            variant === "primary" &&
                "bg-primary text-primary-foreground hover:brightness-[0.94] active:brightness-[0.9]",
            variant === "secondary" &&
                "border border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:text-neutral-950",
            variant === "ghost" && "text-neutral-600 hover:text-neutral-950",
            variant === "segment" &&
                (pressed
                    ? "bg-white text-neutral-950 shadow-sm ring-1 ring-neutral-200/70"
                    : "text-neutral-500 hover:text-neutral-800"),
            className,
        ),
    );
</script>

<button
    {type}
    {onclick}
    {role}
    {id}
    {tabindex}
    aria-controls={ariaControls}
    aria-selected={ariaSelected}
    aria-pressed={variant === "segment" && ariaSelected === undefined ? pressed : undefined}
    class={buttonClass}>
    {@render children()}
</button>
