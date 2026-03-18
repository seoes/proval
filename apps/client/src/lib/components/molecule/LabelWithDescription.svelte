<script lang="ts">
    interface Props {
        label: string;
        description?: string;
        class?: string;
    }
    let { label, description, class: className }: Props = $props();
</script>

<div class={className}>
    <label for={label} class="mb-0.5 block text-sm font-medium text-neutral-700">
        {label}
    </label>
    {#if description}
        <p class="mb-1.5 text-xs text-neutral-500">
            {description}
        </p>
    {/if}
</div>
