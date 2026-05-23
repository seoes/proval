<script lang="ts">
    import type { Snippet } from "svelte";
    import type { SimpleIcon } from "simple-icons";
    import { twMerge } from "tailwind-merge";

    interface Props {
        label: string;
        description?: string;
        selected: boolean;
        onclick: () => void;
        children?: Snippet;
        icon?: SimpleIcon;
        class?: string;
    }
    let { label, description, selected, onclick, children, icon, class: className }: Props = $props();
</script>

<button
    type="button"
    class={twMerge(
        `aspect-square cursor-pointer rounded-xl border px-4 py-3 text-center transition-colors ${
            selected
                ? "border-primary bg-primary/5 text-primary"
                : "border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:border-neutral-700 dark:text-neutral-400"
        }`,
        className,
    )}
    {onclick}>
    {#if icon}
        <div class="mx-auto mb-2 h-6 w-6">
            <svg width="100%" height="100%" viewBox="0 0 24 24" fill="currentColor">
                <path d={icon.path} />
            </svg>
        </div>
    {/if}
    {#if children}
        <div class="mb-2">
            {@render children()}
        </div>
    {/if}
    <p class="text-sm font-medium">{label}</p>
    {#if description}
        <p class="mt-1 text-xs text-neutral-500">{description}</p>
    {/if}
</button>
