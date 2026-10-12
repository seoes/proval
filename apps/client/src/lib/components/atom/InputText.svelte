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
        numeric?: boolean;
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
        numeric = false,
    }: Props = $props();

    function handleInput(event: Event) {
        const target = event.currentTarget as HTMLInputElement;
        const next = numeric ? target.value.replace(/\D/g, "") : target.value;
        if (target.value !== next) {
            target.value = next;
        }
        value = next;
    }
</script>

<input
    value={value ?? ""}
    {placeholder}
    {id}
    {required}
    {disabled}
    class={twMerge(
        "h-10 w-full rounded-lg border border-input bg-input-background px-4 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        disabled ? "cursor-not-allowed opacity-60" : "",
        className,
    )}
    type={password ? "password" : "text"}
    inputmode={numeric ? "numeric" : undefined}
    {onchange}
    {name}
    {onkeydown}
    oninput={handleInput} />
