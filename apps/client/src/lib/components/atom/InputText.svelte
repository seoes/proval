<script lang="ts">
    import { twMerge } from "tailwind-merge";

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
    }: Props = $props();
</script>

<input
    bind:value
    {placeholder}
    {id}
    {required}
    {disabled}
    class={twMerge(
        "h-10 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800",
        disabled ? "cursor-not-allowed opacity-60" : "",
        className,
    )}
    type={password ? "password" : "text"}
    {onchange}
    {name}
    {onkeydown} />
