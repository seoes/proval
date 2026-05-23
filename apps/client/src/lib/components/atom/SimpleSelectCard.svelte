<script lang="ts">
    import { twMerge } from "tailwind-merge";

    interface Props {
        label: string;
        description?: string;
        selected: boolean;
        onclick: () => void;
        class?: string;
    }
    let { label, description, selected, onclick, class: className }: Props = $props();
</script>

<button
    type="button"
    class={twMerge(
        `flex w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors`,
        selected
            ? "border-primary bg-primary/5"
            : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800",
        className,
    )}
    {onclick}
    aria-pressed={selected}>
    <div
        class={twMerge(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            selected ? "border-primary" : "border-neutral-300",
        )}>
        {#if selected}
            <div class="h-2.5 w-2.5 rounded-full bg-primary"></div>
        {/if}
    </div>

    <div class="flex min-w-0 flex-col">
        <span
            class={twMerge(
                "text-sm font-medium",
                selected ? "text-primary" : "text-neutral-700 dark:text-neutral-200",
            )}>
            {label}
        </span>
        {#if description}
            <span class="mt-0.5 text-xs text-neutral-500">{description}</span>
        {/if}
    </div>
</button>
