<script lang="ts">
    import type { Snippet } from 'svelte';
    import type { SimpleIcon } from 'simple-icons';
    import { twMerge } from 'tailwind-merge';

    interface Props {
        label: string;
        description?: string;
        selected: boolean;
        onclick: () => void;
        children?: Snippet;
        icon?: SimpleIcon;
        class?: string;
    }
    let {
        label,
        description,
        selected,
        onclick,
        children,
        icon,
        class: className
    }: Props = $props();
</script>

<button
    type="button"
    class={twMerge(
        `${selected ? 'border-primary fill-primary text-primary' : 'border-neutral-200 fill-neutral-500 text-neutral-500'} aspect-square h-38
        cursor-pointer rounded-xl border 
         px-3 py-2 transition-colors`,
        className
    )}
    {onclick}
>
    {#if icon}
        <div class="aspect-square h-8 w-full">
            <svg width="100%" height="100%" viewBox="0 0 24 24">
                <path d={icon.path} />
            </svg>
        </div>
    {/if}
    <!-- children 대신 snippet으로 받도록 변경 -->
    {#if children}
        <div class="aspect-square h-8 w-full">
            {@render children()}
        </div>
    {/if}
    <p class="mt-2">{label}</p>
    {#if description}
        <p class="mt-2 text-xs">{description}</p>
    {/if}
</button>
