<script lang="ts">
    import "./layout.css";
    import { afterNavigate } from "$app/navigation";
    import Sidebar from "$lib/components/Sidebar.svelte";
    import ModalRoot from "$lib/components/organism/ModalRoot.svelte";

    const { children } = $props();
    let sidebarOpen = $state(false);
    let sidebarAnimate = $state(false);

    function toggleSidebar() {
        sidebarAnimate = true;
        sidebarOpen = !sidebarOpen;
    }

    function closeSidebar() {
        sidebarAnimate = true;
        sidebarOpen = false;
    }

    afterNavigate(() => {
        if (sidebarOpen) closeSidebar();
    });

    $effect(() => {
        if (!sidebarOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") closeSidebar();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    $effect(() => {
        const mq = window.matchMedia("(min-width: 1024px)");
        const onChange = () => {
            sidebarAnimate = false;
            if (mq.matches) sidebarOpen = false;
        };
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    });
</script>

<svelte:head>
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <meta name="theme-color" content="#fafafa" />
</svelte:head>

<div class="flex">
    {#if sidebarOpen}
        <button
            type="button"
            class="fixed inset-0 z-40 bg-black/40 lg:hidden"
            aria-label="Close menu"
            onclick={closeSidebar}></button>
    {/if}

    <aside
        class="fixed inset-y-0 left-0 z-50 w-84 border-r border-neutral-300 lg:static {sidebarAnimate
            ? 'max-lg:transition-transform max-lg:duration-200 max-lg:ease-in-out'
            : ''} {sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}">
        <Sidebar />
    </aside>

    <div class="w-full bg-neutral-50 px-4 pt-0 lg:pt-8">
        <header class="relative flex h-16 items-center justify-between lg:hidden">
            <button
                type="button"
                class="cursor-pointer rounded-md p-2 text-neutral-800"
                aria-expanded={sidebarOpen}
                aria-label="Toggle menu"
                onclick={toggleSidebar}>
                <svg
                    class="size-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round">
                    <line x1="4" y1="7" x2="20" y2="7" />
                    <line x1="4" y1="12" x2="20" y2="12" />
                    <line x1="4" y1="17" x2="20" y2="17" />
                </svg>
            </button>
            <a
                href="/"
                class="absolute left-1/2 -translate-x-1/2 text-3xl font-semibold tracking-tight text-neutral-800"
                >Proval</a>
            <div class="size-10" aria-hidden="true"></div>
        </header>
        <main class="">
            <div class="mx-auto mb-10 max-w-6xl">
                {@render children?.()}
            </div>
        </main>
        <footer></footer>
    </div>
</div>
<ModalRoot />
