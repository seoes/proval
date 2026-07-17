<script lang="ts">
    import Container from "../../lib/components/Container.svelte";
    import DocProse from "../../lib/components/DocProse.svelte";
    import Eyebrow from "../../lib/components/Eyebrow.svelte";
    import SeoHead from "../../lib/components/SeoHead.svelte";
    import { groupDocNav } from "../../lib/content/doc-nav";
    import { breadcrumbLd } from "../../lib/seo";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    const nav = $derived(groupDocNav(data.docs));
    const description = $derived(
        data.index?.description ?? "Install and run Proval on your own infrastructure.",
    );
</script>

<SeoHead
    title="Docs | Proval"
    {description}
    path="/docs"
    jsonLd={breadcrumbLd([
        { name: "Home", path: "/" },
        { name: "Docs", path: "/docs" },
    ])} />

<Container class="py-12 md:py-16">
    <header class="max-w-2xl border-b border-neutral-200 pb-8">
        <Eyebrow>Docs</Eyebrow>
        <h1 class="mt-3 text-3xl font-semibold tracking-tight text-neutral-950 md:text-4xl">Documentation</h1>
        {#if data.index}
            <DocProse html={data.index.html} class="doc-index-intro mt-4" />
        {/if}
    </header>

    {#if nav.quickStartDocs.length > 0}
        <section class="mt-10">
            <h2 class="text-sm font-semibold tracking-wide text-neutral-950 uppercase">Quick start</h2>
            <ul class="mt-4 grid gap-3 sm:grid-cols-2">
                {#each nav.quickStartDocs as doc (doc.slug)}
                    <li>
                        <a
                            href="/docs/{doc.slug}"
                            class="group flex h-full flex-col rounded-xl border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-300 hover:bg-neutral-50">
                            <h3 class="font-semibold tracking-tight text-neutral-950 group-hover:text-primary">
                                {doc.title}
                            </h3>
                            <p class="mt-2 flex-1 text-sm leading-relaxed text-neutral-600">{doc.description}</p>
                        </a>
                    </li>
                {/each}
            </ul>
        </section>
    {/if}

    {#if nav.gitProviderDocs.length > 0}
        <section class="mt-10">
            <h2 class="text-sm font-semibold tracking-wide text-neutral-950 uppercase">Git Provider</h2>
            <ul class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {#each nav.gitProviderDocs as doc (doc.slug)}
                    <li>
                        <a
                            href="/docs/{doc.slug}"
                            class="group flex h-full flex-col rounded-xl border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-300 hover:bg-neutral-50">
                            <h3 class="font-semibold tracking-tight text-neutral-950 group-hover:text-primary">
                                {doc.title}
                            </h3>
                            <p class="mt-2 flex-1 text-sm leading-relaxed text-neutral-600">{doc.description}</p>
                        </a>
                    </li>
                {/each}
            </ul>
        </section>
    {/if}

    {#if nav.llmDocs.length > 0}
        <section class="mt-10">
            <h2 class="text-sm font-semibold tracking-wide text-neutral-950 uppercase">LLM</h2>
            <ul class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {#each nav.llmDocs as doc (doc.slug)}
                    <li>
                        <a
                            href="/docs/{doc.slug}"
                            class="group flex h-full flex-col rounded-xl border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-300 hover:bg-neutral-50">
                            <h3 class="font-semibold tracking-tight text-neutral-950 group-hover:text-primary">
                                {doc.title}
                            </h3>
                            <p class="mt-2 flex-1 text-sm leading-relaxed text-neutral-600">{doc.description}</p>
                        </a>
                    </li>
                {/each}
            </ul>
        </section>
    {/if}
</Container>
