<script lang="ts">
    import Container from "../../lib/components/Container.svelte";
    import Eyebrow from "../../lib/components/Eyebrow.svelte";
    import SeoHead from "../../lib/components/SeoHead.svelte";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();
</script>

<SeoHead title="Blog | Proval" description="Updates and notes from the Proval project." path="/blog" />

<Container class="py-16 md:py-24">
    <Eyebrow>Blog</Eyebrow>
    <h1 class="mt-3 text-4xl font-semibold tracking-tight text-neutral-950">Project notes</h1>
    <p class="mt-4 max-w-2xl text-neutral-600">
        Updates and practical notes about self-hosted review automation, Git host workflows, and bring-your-own-model
        infrastructure.
    </p>

    <ul class="mt-10 space-y-4">
        {#each data.posts as post (post.slug)}
            <li>
                <a
                    href="/blog/{post.slug}"
                    class="group block rounded-2xl border border-neutral-200 bg-white p-6 transition-colors hover:border-neutral-300 hover:bg-neutral-50">
                    <p class="text-sm text-neutral-500">
                        <time datetime={post.date}>{post.date}</time>
                    </p>
                    <h2 class="mt-2 text-xl font-semibold tracking-tight text-neutral-950 group-hover:underline">
                        {post.title}
                    </h2>
                    <p class="mt-2 text-sm leading-6 text-neutral-600">{post.description}</p>
                </a>
            </li>
        {/each}
    </ul>
</Container>
