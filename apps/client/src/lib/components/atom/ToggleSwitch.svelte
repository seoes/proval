<script lang="ts">
    interface Props {
        checked?: boolean;
        disabled?: boolean;
    }
    let { checked = $bindable(false), disabled = false }: Props = $props();

    const classList =
        "h-5 w-9 rounded-full bg-gray-200 transition-colors duration-300 ease-in-out peer-checked:bg-blue-600 peer-focus:ring-blue-300/50 peer-focus:outline-none after:absolute after:top-[2px] after:left-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-300 after:ease-[cubic-bezier(0.34,1.56,0.64,1)] after:content-[''] peer-checked:after:translate-x-4";
</script>

<label
    class="relative inline-flex cursor-pointer items-center"
    class:cursor-not-allowed={disabled}
    class:opacity-40={disabled}>
    <input type="checkbox" class="peer sr-only" bind:checked {disabled} />
    <div class={classList}></div>
</label>
