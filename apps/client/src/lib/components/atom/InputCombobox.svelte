<script lang="ts">
    import InputText from "./InputText.svelte";
    import { twMerge } from "tailwind-merge";

    interface Props {
        value?: string;
        suggestionList: readonly string[];
        placeholder?: string;
        disabled?: boolean;
        class?: string;
        id?: string;
    }

    let {
        value = $bindable(""),
        suggestionList,
        placeholder,
        disabled = false,
        class: className,
        id,
    }: Props = $props();

    let open = $state(false);
    let containerRef: HTMLDivElement | undefined = $state();

    const filteredList = $derived.by(() => {
        const query = (value ?? "").trim().toLowerCase();
        if (!query) {
            return suggestionList;
        }
        return suggestionList.filter((item) => item.toLowerCase().includes(query));
    });

    function select(item: string) {
        value = item;
        open = false;
    }

    function handleClickOutside(event: MouseEvent) {
        if (containerRef && !containerRef.contains(event.target as Node)) {
            open = false;
        }
    }

    $effect(() => {
        if (!open) return;
        document.addEventListener("click", handleClickOutside);
        return () => document.removeEventListener("click", handleClickOutside);
    });
</script>

<div
    bind:this={containerRef}
    class={twMerge("relative", className)}
    onfocusin={() => {
        if (!disabled) open = true;
    }}>
    <InputText {id} {placeholder} {disabled} bind:value />
    {#if open && filteredList.length > 0}
        <ul
            class="absolute top-full z-50 mt-1 max-h-60 w-full overflow-x-hidden overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
            role="listbox">
            {#each filteredList as item (item)}
                <li>
                    <button
                        type="button"
                        role="option"
                        aria-selected={item === value}
                        class={twMerge(
                            "flex w-full cursor-pointer px-4 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent",
                            item === value && "bg-primary/10",
                        )}
                        onmousedown={(event) => event.preventDefault()}
                        onclick={() => select(item)}>
                        {item}
                    </button>
                </li>
            {/each}
        </ul>
    {/if}
</div>
