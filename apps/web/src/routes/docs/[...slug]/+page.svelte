<script lang="ts">
    import Container from "../../../lib/components/Container.svelte";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();
</script>

<svelte:head>
    <title>{data.doc.title} | Proval Docs</title>
    <meta name="description" content={data.doc.description} />
</svelte:head>

<Container wide class="py-16 md:py-24">
    <div class="grid gap-10 lg:grid-cols-[240px_1fr]">
        <aside class="lg:sticky lg:top-20 lg:self-start">
            <a href="/docs" class="text-sm font-medium text-neutral-500 hover:text-neutral-900"> Documentation </a>
            <nav class="mt-5 space-y-1 border-l border-neutral-200 pl-4">
                {#each data.docTree as doc (doc.slug)}
                    <a
                        href="/docs/{doc.slug}"
                        class={doc.slug === data.doc.slug
                            ? "block py-1.5 text-sm font-semibold text-primary"
                            : "block py-1.5 text-sm text-neutral-500 hover:text-neutral-900"}>
                        {doc.title}
                    </a>
                {/each}
            </nav>
        </aside>

        <article class="prose max-w-3xl">
            <h1>{data.doc.title}</h1>
            <p>{data.doc.description}</p>
            {@html data.doc.html}
        </article>
    </div>
</Container>
