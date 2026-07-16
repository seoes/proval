<script lang="ts">
    import "./layout.css";
    import SiteFooter from "../lib/components/SiteFooter.svelte";
    import SiteHeader from "../lib/components/SiteHeader.svelte";

    let { children } = $props();
</script>

<svelte:head>
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <script defer data-domain="proval.app" src="https://analytics.proval.app/js/script.js"></script>
</svelte:head>

<div class="flex min-h-screen flex-col bg-white text-neutral-950">
    <SiteHeader />
    <main class="flex-1">
        {@render children()}
    </main>
    <SiteFooter />
</div>
