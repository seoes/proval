<script lang="ts">
    import markUrl from "@proval/brand/mark.svg";
    import { twMerge } from "tailwind-merge";

    let { class: className = "size-4" }: { class?: string } = $props();
</script>

<img src={markUrl} alt="" class={twMerge("inline-block rounded-md", className)} aria-hidden="true" />
