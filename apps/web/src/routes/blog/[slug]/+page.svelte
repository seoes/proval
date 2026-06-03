<script lang="ts">
    import Container from "../../../lib/components/Container.svelte";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();
</script>

<svelte:head>
    <title>{data.post.title} | Proval</title>
    <meta name="description" content={data.post.description} />
</svelte:head>

<Container class="py-16 md:py-24">
    <p class="text-sm">
        <a href="/blog" class="font-medium text-neutral-500 hover:text-neutral-900">Back to blog</a>
    </p>

    <header class="mt-8 border-b border-neutral-200 pb-8">
        <p class="text-sm text-neutral-500">{data.post.date}</p>
        <h1 class="mt-3 text-4xl font-semibold tracking-tight text-neutral-950">{data.post.title}</h1>
        <p class="mt-4 text-lg leading-8 text-neutral-600">{data.post.description}</p>
    </header>

    <article class="prose mt-8">{@html data.post.html}</article>
</Container>
