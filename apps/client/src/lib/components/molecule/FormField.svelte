<script lang="ts">
    import FieldTitle from "../atom/FieldTitle.svelte";
    import Description from "../atom/Description.svelte";
    import { nextFieldControlId } from "$lib/field-ids";
    import type { Snippet } from "svelte";
    import { twMerge } from "tailwind-merge";

    type ControlChild = Snippet<[{ id: string }]>;

    interface Props {
        label?: string;
        description?: string;
        upper?: boolean;
        id?: string;
        class?: string;
        /** If false, the title is not a `<label for=…>` (e.g. toggle groups, custom controls). */
        linkLabelToControl?: boolean;
        children?: ControlChild;
    }

    let {
        label,
        description,
        upper = false,
        id,
        class: className,
        linkLabelToControl = true,
        children: control,
    }: Props = $props();

    const idFallback = nextFieldControlId("field");
    const controlId = $derived(id ?? idFallback);
    const forIdValue = $derived(linkLabelToControl && label && control ? controlId : undefined);
</script>

<div class={twMerge("block", className)}>
    {#if upper}
        {#if label}
            <FieldTitle class={description ? "mb-1" : "mb-2"} forId={forIdValue}>{label}</FieldTitle>
        {/if}
        {#if description}
            <Description class="mb-2" placement="above">{description}</Description>
        {/if}
        {#if control}
            {@render control({ id: controlId })}
        {/if}
    {:else}
        {#if label}
            <FieldTitle class="mb-1.5" forId={forIdValue}>{label}</FieldTitle>
        {/if}
        {#if control}
            {@render control({ id: controlId })}
        {/if}
        {#if description}
            <Description class="mt-1.5" placement="below">{description}</Description>
        {/if}
    {/if}
</div>
