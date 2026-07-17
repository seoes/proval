<script lang="ts">
    import Container from "../../../lib/components/Container.svelte";
    import SeoHead from "../../../lib/components/SeoHead.svelte";
    import { articleLd } from "../../../lib/seo";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();
</script>

<SeoHead
    title="{data.post.title} | Proval"
    description={data.post.description}
    path="/blog/{data.post.slug}"
    type="article"
    publishedTime={data.post.date}
    jsonLd={articleLd({
        title: data.post.title,
        description: data.post.description,
        path: `/blog/${data.post.slug}`,
        datePublished: data.post.date,
    })} />

<Container class="py-16 md:py-24">
    <p class="text-sm">
        <a href="/blog" class="font-medium text-neutral-500 hover:text-neutral-900">Back to blog</a>
    </p>

    <header class="mt-8 border-b border-neutral-200 pb-8">
        <p class="text-sm text-neutral-500">
            <time datetime={data.post.date}>{data.post.date}</time>
        </p>
        <h1 class="mt-3 text-4xl font-semibold tracking-tight text-neutral-950">{data.post.title}</h1>
        <p class="mt-4 text-lg leading-8 text-neutral-600">{data.post.description}</p>
    </header>

    <article class="prose mt-10 max-w-3xl">{@html data.post.html}</article>
</Container>
