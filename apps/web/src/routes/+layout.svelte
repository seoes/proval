<script lang="ts">
    import "./layout.css";
    import favicon from "../lib/assets/favicon.svg";
    import SiteFooter from "../lib/components/SiteFooter.svelte";
    import SiteHeader from "../lib/components/SiteHeader.svelte";

    let { children } = $props();
</script>

<svelte:head>
    <link rel="icon" href={favicon} />
    <script defer data-domain="proval.app" src="https://analytics.proval.app/js/script.js"></script>
</svelte:head>

<div class="flex min-h-screen flex-col bg-white text-neutral-950">
    <SiteHeader />
    <main class="flex-1">
        {@render children()}
    </main>
    <SiteFooter />
</div>
