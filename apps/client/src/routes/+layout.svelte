<script lang="ts">
    import './layout.css';
    import favicon from '$lib/assets/favicon.svg';
    import Sidebar from '$lib/components/Sidebar.svelte';
    import ModalRoot from '$lib/components/organism/ModalRoot.svelte';

    let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="flex">
    <aside class=" w-84 border-r border-neutral-300">
        <Sidebar />
    </aside>
    <div class="w-full bg-neutral-50 px-4 pt-8">
        <header class="h-16"></header>
        <main class="">
            <div class="mx-auto mb-10 max-w-6xl">
                {@render children?.()}
            </div>
        </main>
        <footer></footer>
    </div>
</div>
<ModalRoot />
