<script lang="ts">
    import Container from "../../lib/components/Container.svelte";
    import Eyebrow from "../../lib/components/Eyebrow.svelte";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();
</script>

<svelte:head>
    <title>Docs | Proval</title>
    <meta name="description" content="Install and run Proval on your own infrastructure." />
</svelte:head>

<Container class="py-16 md:py-24">
    <Eyebrow>Docs</Eyebrow>
    <h1 class="mt-3 text-4xl font-semibold tracking-tight text-neutral-950">Documentation</h1>

    {#if data.index}
        <div class="prose mt-6">{@html data.index.html}</div>
    {/if}

    <ul class="mt-10 grid gap-4">
        {#each data.docs as doc (doc.slug)}
            <li>
                <a
                    href="/docs/{doc.slug}"
                    class="block rounded-2xl border border-neutral-200 bg-white p-6 transition-colors hover:border-neutral-300 hover:bg-neutral-50">
                    <h2 class="font-semibold tracking-tight text-neutral-950">{doc.title}</h2>
                    <p class="mt-2 text-sm leading-6 text-neutral-600">{doc.description}</p>
                </a>
            </li>
        {/each}
    </ul>
</Container>
