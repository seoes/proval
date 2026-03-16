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
    }

    let {
        value = $bindable(),
        placeholder,
        password,
        class: className,
        onchange,
        name,
        onkeydown
    }: Props = $props();
</script>

<input
    bind:value
    {placeholder}
    class={twMerge(
        `h-14 rounded-xl border border-neutral-200 bg-gray-50 px-4 outline-none dark:border-neutral-700 dark:bg-neutral-800`,
        className
    )}
    type={password ? 'password' : 'text'}
    {onchange}
    {name}
    {onkeydown}
/>
