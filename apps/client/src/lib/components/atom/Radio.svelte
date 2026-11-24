<script lang="ts" generics="Value extends string = string">
    import { twMerge } from "tailwind-merge";

    interface Props {
        group?: Value;
        value: Value;
        label: string;
        name?: string;
        disabled?: boolean;
        class?: string;
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- ESLint cannot see the Svelte generic, svelte-check needs the cast
    let { group = $bindable("" as Value), value, label, name, disabled = false, class: className }: Props = $props();
</script>

<label
    class={twMerge(
        "inline-flex cursor-pointer items-center gap-2.5",
        disabled ? "cursor-not-allowed opacity-60" : "",
        className,
    )}>
    <span class="relative inline-flex h-5 w-5 shrink-0">
        <input type="radio" class="peer sr-only" {name} {value} {disabled} bind:group />
        <span
            class="pointer-events-none absolute inset-0 rounded-full border-2 border-border-strong transition-colors peer-checked:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-inset"
            aria-hidden="true">
        </span>
        <span
            class="pointer-events-none absolute inset-0 m-auto h-2.5 w-2.5 rounded-full bg-primary opacity-0 transition-opacity peer-checked:opacity-100"
            aria-hidden="true">
        </span>
    </span>
    <span class="text-sm text-foreground">{label}</span>
</label>
