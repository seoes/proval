<script lang="ts">
    import type { HTMLSelectAttributes } from 'svelte/elements';
    import FormField from '../molecule/FormField.svelte';
    import { twMerge } from 'tailwind-merge';

    type Option = { value: string; label: string };

    type Props = {
        id?: string;
        label?: string;
        description?: string;
        upper?: boolean;
        linkLabelToControl?: boolean;
        options: Option[];
        class?: string;
    } & HTMLSelectAttributes;

    let {
        id,
        label,
        description,
        upper = false,
        linkLabelToControl = true,
        options,
        class: className,
        disabled,
        required,
        ...selectProps
    }: Props = $props();
</script>

<FormField {label} {description} {upper} {id} {linkLabelToControl}>
    {#snippet children({ id: selectId })}
        <select
            id={selectId}
            {disabled}
            {required}
            class={twMerge(
                'h-10 w-full rounded-xl border border-neutral-200 bg-gray-50 px-4 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800',
                disabled ? 'cursor-not-allowed opacity-60' : '',
                className
            )}
            {...selectProps}
        >
            {#each options as opt (opt.value)}
                <option value={opt.value}>{opt.label}</option>
            {/each}
        </select>
    {/snippet}
</FormField>
