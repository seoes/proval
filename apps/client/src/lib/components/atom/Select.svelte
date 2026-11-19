<script lang="ts" generics="Value extends string = string">
    import FormField from "../molecule/FormField.svelte";
    import { twMerge } from "tailwind-merge";

    type SelectOption = { value: Value; label: string; description?: string };

    type Props = {
        id?: string;
        label?: string;
        description?: string;
        upper?: boolean;
        linkLabelToControl?: boolean;
        options: SelectOption[];
        value?: Value;
        placeholder?: string;
        disabled?: boolean;
        class?: string;
        menuClass?: string;
        onValueChange?: (value: Value) => void;
    };

    let {
        id,
        label,
        description,
        upper = false,
        linkLabelToControl = true,
        options,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- ESLint cannot see the Svelte generic, svelte-check needs the cast
        value = $bindable("" as Value),
        placeholder = "Select",
        disabled = false,
        class: className,
        menuClass,
        onValueChange,
    }: Props = $props();

    let open = $state(false);
    let highlightedIndex = $state(0);
    let containerRef: HTMLDivElement | undefined = $state();

    const selectedOption = $derived(options.find((option) => option.value === value));
    const displayLabel = $derived(selectedOption?.label ?? (value ? value : placeholder));
    const isPlaceholder = $derived(!selectedOption && !value);

    function optionId(selectId: string, index: number) {
        return `${selectId}-option-${index}`;
    }

    function selectedIndex() {
        const index = options.findIndex((option) => option.value === value);
        return index >= 0 ? index : 0;
    }

    function close() {
        open = false;
    }

    function toggle() {
        if (disabled) return;
        open = !open;
        if (open) highlightedIndex = selectedIndex();
    }

    function selectOption(option: SelectOption) {
        value = option.value;
        onValueChange?.(option.value);
        close();
    }

    function handleClickOutside(event: MouseEvent) {
        if (containerRef && !containerRef.contains(event.target as Node)) {
            close();
        }
    }

    function moveHighlight(delta: number) {
        if (options.length === 0) return;
        highlightedIndex = Math.min(options.length - 1, Math.max(0, highlightedIndex + delta));
    }

    function handleKeydown(event: KeyboardEvent) {
        if (disabled) return;

        if (event.key === "Escape") {
            if (open) {
                event.preventDefault();
                close();
            }
            return;
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!open) {
                open = true;
                highlightedIndex = selectedIndex();
            } else {
                moveHighlight(1);
            }
            return;
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {
                open = true;
                highlightedIndex = selectedIndex();
            } else {
                moveHighlight(-1);
            }
            return;
        }

        if (event.key === "Home") {
            if (!open) return;
            event.preventDefault();
            highlightedIndex = 0;
            return;
        }

        if (event.key === "End") {
            if (!open || options.length === 0) return;
            event.preventDefault();
            highlightedIndex = options.length - 1;
            return;
        }

        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!open) {
                open = true;
                highlightedIndex = selectedIndex();
                return;
            }
            const option = options[highlightedIndex];
            if (option) selectOption(option);
        }
    }

    $effect(() => {
        if (!open) return;
        document.addEventListener("click", handleClickOutside);
        return () => document.removeEventListener("click", handleClickOutside);
    });

    $effect(() => {
        if (!open || !containerRef) return;
        const option = containerRef.querySelector(`[id$="-option-${highlightedIndex}"]`);
        option?.scrollIntoView({ block: "nearest" });
    });
</script>

<FormField {label} {description} {upper} {id} {linkLabelToControl}>
    {#snippet children({ id: selectId })}
        {@const listboxId = `${selectId}-listbox`}
        <div bind:this={containerRef} class="relative">
            <button
                type="button"
                id={selectId}
                {disabled}
                class={twMerge(
                    "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-input-background px-4 text-left text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                    className,
                )}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listboxId}
                aria-activedescendant={open ? optionId(selectId, highlightedIndex) : undefined}
                role="combobox"
                onclick={toggle}
                onkeydown={handleKeydown}>
                <span class={twMerge("min-w-0 truncate", isPlaceholder ? "text-muted-foreground" : "text-foreground")}>
                    {displayLabel}
                </span>
                <svg
                    class={twMerge("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true">
                    <path
                        fill-rule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                        clip-rule="evenodd" />
                </svg>
            </button>

            {#if open}
                <ul
                    id={listboxId}
                    class={twMerge(
                        "absolute top-full z-50 mt-1 max-h-60 w-full overflow-x-hidden overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-lg  ",
                        menuClass,
                    )}
                    role="listbox">
                    {#each options as option, index (option.value)}
                        <li>
                            <button
                                type="button"
                                id={optionId(selectId, index)}
                                role="option"
                                aria-selected={option.value === value}
                                class={twMerge(
                                    "flex w-full cursor-pointer flex-col px-4 py-2 text-left transition-colors",
                                    index === 0 && "rounded-t-lg",
                                    index === options.length - 1 && "rounded-b-lg",
                                    option.value === value
                                        ? "bg-primary/10"
                                        : index === highlightedIndex
                                          ? "bg-accent text-accent-foreground"
                                          : "hover:bg-accent",
                                )}
                                onclick={() => selectOption(option)}
                                onpointerenter={() => (highlightedIndex = index)}>
                                <span class="text-sm text-foreground">{option.label}</span>
                                {#if option.description}
                                    <span class="mt-0.5 text-xs text-muted-foreground">{option.description}</span>
                                {/if}
                            </button>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>
    {/snippet}
</FormField>
