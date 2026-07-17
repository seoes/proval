<script lang="ts">
    import Container from "../../../lib/components/Container.svelte";
    import DocProse from "../../../lib/components/DocProse.svelte";
    import SeoHead from "../../../lib/components/SeoHead.svelte";
    import { groupDocNav } from "../../../lib/content/doc-nav";
    import { breadcrumbLd } from "../../../lib/seo";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    const nav = $derived(groupDocNav(data.docTree));
</script>

<SeoHead
    title="{data.doc.title} | Proval Docs"
    description={data.doc.description}
    path="/docs/{data.doc.slug}"
    jsonLd={breadcrumbLd([
        { name: "Home", path: "/" },
        { name: "Docs", path: "/docs" },
        { name: data.doc.title, path: `/docs/${data.doc.slug}` },
    ])} />

<Container wide class="py-12 md:py-16">
    <div class="grid gap-12 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside class="lg:sticky lg:top-20 lg:self-start">
            <a href="/docs" class="text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-900">
                Documentation
            </a>
            <nav class="mt-6 space-y-1 border-l border-neutral-200 pl-4">
                {#each nav.quickStartDocs as doc (doc.slug)}
                    <a
                        href="/docs/{doc.slug}"
                        class={doc.slug === data.doc.slug
                            ? "block py-1.5 text-sm font-semibold text-primary"
                            : "block py-1.5 text-sm text-neutral-600 transition-colors hover:text-neutral-950"}>
                        {doc.title}
                    </a>
                {/each}

                {#if nav.gitProviderDocs.length > 0}
                    <p
                        class="mt-5 mb-1 border-t border-neutral-200 pt-4 text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">
                        Git Provider
                    </p>
                    {#each nav.gitProviderDocs as doc (doc.slug)}
                        <a
                            href="/docs/{doc.slug}"
                            class={doc.slug === data.doc.slug
                                ? "block py-1.5 text-sm font-semibold text-primary"
                                : "block py-1.5 text-sm text-neutral-600 transition-colors hover:text-neutral-950"}>
                            {doc.title}
                        </a>
                    {/each}
                {/if}

                {#if nav.llmDocs.length > 0}
                    <p
                        class="mt-5 mb-1 border-t border-neutral-200 pt-4 text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">
                        LLM
                    </p>
                    {#each nav.llmDocs as doc (doc.slug)}
                        <a
                            href="/docs/{doc.slug}"
                            class={doc.slug === data.doc.slug
                                ? "block py-1.5 text-sm font-semibold text-primary"
                                : "block py-1.5 text-sm text-neutral-600 transition-colors hover:text-neutral-950"}>
                            {doc.title}
                        </a>
                    {/each}
                {/if}
            </nav>
        </aside>

        <article class="min-w-0 max-w-3xl">
            <header class="border-b border-neutral-200 pb-8">
                <h1 class="text-3xl font-semibold tracking-tight text-neutral-950 md:text-[2rem] md:leading-tight">
                    {data.doc.title}
                </h1>
                <p class="mt-3 max-w-2xl text-lg leading-relaxed text-neutral-600">
                    {data.doc.description}
                </p>
            </header>

            <DocProse html={data.doc.html} class="doc-body" />
        </article>
    </div>
</Container>
