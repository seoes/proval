<script lang="ts">
    import type { Snippet } from 'svelte';
    import { twMerge } from 'tailwind-merge';

    interface Props {
        type?: 'button' | 'submit' | 'reset';
        class?: string;
        onclick?: () => void;
        children: Snippet;
        primary?: boolean;
        secondary?: boolean;
        text?: boolean;
        disabled?: boolean;
    }

    let {
        type = 'button',
        class: className,
        onclick,
        children,
        primary = false,
        secondary = false,
        text = false,
        disabled = false
    }: Props = $props();

    let buttonClass = twMerge(
        'cursor-pointer rounded-lg px-6 py-3 text-sm text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 h-full w-full',
        primary && 'bg-primary',
        secondary && 'border border-neutral-200 bg-white text-neutral-600',
        text && 'text-neutral-500 hover:text-neutral-700 px-0 py-0'
    );
</script>

<button {type} class={twMerge(buttonClass, className)} {onclick} {disabled}>{@render children()}</button>
