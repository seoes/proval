<script lang="ts">
    import { twMerge } from 'tailwind-merge';

    interface Props {
        value?: string;
        placeholder?: string;
        password?: boolean;
        class?: string;
        onchange?: (event: Event) => void;
        name?: string;
        onkeydown?: (event: KeyboardEvent) => void;
        id?: string;
    }

    let {
        value = $bindable(),
        placeholder,
        password,
        class: className,
        onchange,
        name,
        onkeydown,
        id
    }: Props = $props();
</script>

<input
    bind:value
    {placeholder}
    {id}
    class={twMerge(
        `h-10 w-full rounded-xl border border-neutral-200 bg-gray-50 px-4 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800`,
        className
    )}
    type={password ? 'password' : 'text'}
    {onchange}
    {name}
    {onkeydown}
/>
