<script lang="ts">
    import { twMerge } from 'tailwind-merge';

    interface Props {
        value?: string;
        placeholder?: string;
        password?: boolean;
        disabled?: boolean;
        class?: string;
        onchange?: (event: Event) => void;
        name?: string;
        onkeydown?: (event: KeyboardEvent) => void;
        id?: string;
        required?: boolean;
        label?: string;
        description?: string;
    }

    let {
        value = $bindable(),
        placeholder,
        password,
        disabled = false,
        class: className,
        onchange,
        name,
        onkeydown,
        id,
        required,
        label,
        description
    }: Props = $props();
</script>

{#if label}
    <label for={id} class="mb-1.5 ml-1 block text-sm font-medium text-neutral-700">{label} </label>
{/if}

<input
    bind:value
    {placeholder}
    {id}
    {required}
    {disabled}
    class={twMerge(
        `h-10 w-full rounded-xl border border-neutral-200 bg-gray-50 px-4 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800`,
        disabled ? 'cursor-not-allowed opacity-60' : '',
        className
    )}
    type={password ? 'password' : 'text'}
    {onchange}
    {name}
    {onkeydown}
/>

{#if description}
    <p class="mt-1.5 ml-1 text-xs text-neutral-500">{description}</p>
{/if}
