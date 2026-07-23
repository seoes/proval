<script lang="ts">
    import Container from "$lib/components/Container.svelte";
    import ButtonLink from "$lib/components/ButtonLink.svelte";
    import SeoHead from "$lib/components/SeoHead.svelte";
    import { page } from "$app/state";

    const status = $derived(page.status);
    const message = $derived(status === 404 ? "Page not found" : (page.error?.message ?? "Something went wrong"));
</script>

<SeoHead title="Page not found | Proval" description="This page could not be found." path="/404" noindex />

<Container class="py-24 text-center md:py-32">
    <p class="font-mono text-sm font-medium tracking-widest text-neutral-400 uppercase">{status}</p>
    <h1 class="mt-3 text-3xl font-semibold tracking-tight text-neutral-950 md:text-4xl">{message}</h1>
    <p class="mx-auto mt-4 max-w-md text-neutral-600">
        The page you requested does not exist or is no longer available.
    </p>
    <div class="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        <ButtonLink href="/" variant="primary">Back to home</ButtonLink>
        <ButtonLink href="/docs" variant="secondary">Documentation</ButtonLink>
    </div>
</Container>
