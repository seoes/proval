<script lang="ts">
    import "./layout.css";
    import { onMount } from "svelte";
    import { afterNavigate } from "$app/navigation";
    import { page } from "$app/state";
    import Sidebar from "$lib/components/Sidebar.svelte";
    import ProvalMark from "$lib/components/atom/ProvalMark.svelte";
    import ThemeToggle from "$lib/components/atom/ThemeToggle.svelte";
    import ModalRoot from "$lib/components/organism/ModalRoot.svelte";
    import { isDemoMode } from "$lib/demo/enabled";
    import { isAuthPagePath } from "$lib/auth";
    import { initializeTheme } from "$lib/store/theme";
    import { setUserPromptMaxLength } from "$lib/store/instance";
    import type { LayoutProps } from "./$types";

    const GITHUB_URL = "https://github.com/seoes/proval";

    const { data, children }: LayoutProps = $props();
    const demoMode = isDemoMode();
    let sidebarOpen = $state(false);
    let sidebarAnimate = $state(false);

    const isLayoutHidden = $derived(isAuthPagePath(page.url.pathname));

    onMount(initializeTheme);

    $effect(() => {
        setUserPromptMaxLength(data.auth?.userPromptMaxLength);
    });

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
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
</svelte:head>

{#if isLayoutHidden}
    <div class="relative min-h-screen bg-background">
        <div class="absolute top-4 right-4">
            <ThemeToggle />
        </div>
        <main class="mx-auto flex min-h-screen max-w-md items-center px-4 py-20">
            {@render children?.()}
        </main>
    </div>
    <ModalRoot />
{:else}
    <div class="flex">
        {#if sidebarOpen}
            <button
                type="button"
                class="fixed inset-0 z-40 bg-overlay/40 lg:hidden"
                aria-label="Close menu"
                onclick={closeSidebar}></button>
        {/if}

        <aside
            class="fixed inset-y-0 left-0 z-50 w-84 border-r border-sidebar-border lg:static {sidebarAnimate
                ? 'max-lg:transition-transform max-lg:duration-200 max-lg:ease-in-out'
                : ''} {sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}">
            <Sidebar />
        </aside>

        <div class="flex min-w-0 flex-1 flex-col bg-background">
            {#if demoMode}
                <div class="border-b border-warning/25 bg-warning-muted px-4 py-2 text-center text-sm text-warning">
                    Demo mode — sample data, read-only.
                    <a
                        href={GITHUB_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="ml-1 font-medium underline underline-offset-2 hover:text-warning">
                        View on GitHub
                    </a>
                </div>
            {/if}

            <div class="px-4 pt-0 lg:pt-8">
                <header class="relative flex h-16 items-center justify-between lg:hidden">
                    <button
                        type="button"
                        class="cursor-pointer rounded-md p-2 text-foreground"
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
                    <a href="/" class="absolute left-1/2 -translate-x-1/2" aria-label="Proval home">
                        <ProvalMark
                            wordmark
                            class="size-7"
                            wordmarkClass="text-2xl font-semibold tracking-tight text-foreground" />
                    </a>
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
    </div>
    <ModalRoot />
{/if}
