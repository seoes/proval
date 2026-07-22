<script lang="ts">
    import { COMPETITOR_LIST } from "../../lib/alternative/competitorList";
    import Breadcrumb from "../../lib/components/Breadcrumb.svelte";
    import ButtonLink from "../../lib/components/ButtonLink.svelte";
    import Container from "../../lib/components/Container.svelte";
    import Eyebrow from "../../lib/components/Eyebrow.svelte";
    import SeoHead from "../../lib/components/SeoHead.svelte";
    import { breadcrumbLd, itemListLd } from "../../lib/seo";

    const axisList = [
        { title: "Self-hosted", body: "Your network" },
        { title: "Your Own Model", body: "Your Own API or local model" },
        { title: "Multi Git", body: "GitHub · GitLab · Forgejo" },
        { title: "Open source", body: "No seat tax" },
    ] as const;

    const hubDescription =
        "Compare Proval to CodeRabbit, Qodo, Greptile, and Graphite. Self-hosted AI code review with Your Own Model for GitHub, GitLab, and Forgejo.";

    const jsonLd = [
        breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Alternatives", path: "/alternatives" },
        ]),
        itemListLd({
            name: "AI code review alternatives",
            description: hubDescription,
            path: "/alternatives",
            itemList: COMPETITOR_LIST.map((item) => ({
                name: `${item.name} alternative`,
                path: `/alternatives/${item.slug}`,
            })),
        }),
    ];
</script>

<SeoHead
    title="AI Code Review Alternatives | Proval"
    description={hubDescription}
    path="/alternatives"
    ogImagePath="/og-alternatives.png"
    ogImageAlt="Proval AI code review alternatives"
    {jsonLd} />

<section
    class="relative -mt-[4.5rem] overflow-hidden border-b border-neutral-200"
    aria-labelledby="alternatives-hub-heading">
    <Container wide class="relative pt-[calc(4.5rem+5rem)] pb-16 md:pt-[calc(4.5rem+7rem)] md:pb-24">
        <Breadcrumb items={[{ name: "Home", href: "/" }, { name: "Alternatives" }]} />
        <Eyebrow class="mt-6">Alternatives</Eyebrow>
        <h1
            id="alternatives-hub-heading"
            class="mt-5 max-w-4xl text-4xl leading-[1.02] font-semibold tracking-[-0.05em] text-neutral-950 md:text-6xl lg:text-7xl">
            AI code review alternatives
        </h1>
        <p class="mt-6 max-w-2xl text-base leading-7 text-neutral-600">
            Proval is a self-hosted, open source AI code review agent you can run as an alternative to CodeRabbit, Qodo,
            Greptile, and Graphite. Bring Your Own Model, keep review traffic on your network, and use GitHub, GitLab,
            or Forgejo without seat lock-in.
        </p>
        <div class="mt-10">
            <ButtonLink href="/" variant="primary" class="text-base">Try Proval</ButtonLink>
        </div>
    </Container>
</section>

<section class="border-t border-neutral-200/80 py-20 md:py-28" aria-labelledby="axis-heading">
    <Container wide>
        <div class="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-end lg:gap-12">
            <div>
                <Eyebrow>Why these pages</Eyebrow>
                <h2
                    id="axis-heading"
                    class="mt-3 bg-linear-to-r from-neutral-800 to-neutral-950 bg-clip-text pb-[0.15em] text-4xl leading-[1.15] font-semibold tracking-[-0.035em] text-transparent md:text-5xl">
                    Built for control, not seat lock-in.
                </h2>
            </div>
        </div>
        <ul class="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {#each axisList as axis, index (axis.title)}
                <li class="rounded-2xl border border-neutral-200/80 bg-neutral-50/70 px-5 py-5">
                    <p class="font-mono text-[11px] font-semibold tracking-widest text-neutral-400 uppercase">
                        0{index + 1}
                    </p>
                    <h3 class="mt-2 text-base font-semibold tracking-tight text-neutral-950">{axis.title}</h3>
                    <p class="mt-1 text-sm text-neutral-500">{axis.body}</p>
                </li>
            {/each}
        </ul>
    </Container>
</section>

<section
    class="relative overflow-hidden border-t border-neutral-200/80 bg-neutral-50/40 py-20 md:py-28"
    aria-labelledby="compare-list-heading">
    <Container wide>
        <Eyebrow>Compare</Eyebrow>
        <h2
            id="compare-list-heading"
            class="mt-3 max-w-3xl bg-linear-to-r from-neutral-800 to-neutral-950 bg-clip-text pb-[0.15em] text-4xl leading-[1.15] font-semibold tracking-[-0.035em] text-transparent md:text-5xl">
            Proval vs AI review bots
        </h2>
        <ul class="mt-10 grid gap-4 md:grid-cols-2">
            {#each COMPETITOR_LIST as item, index (item.slug)}
                <li>
                    <a
                        href="/alternatives/{item.slug}"
                        class="group flex h-full flex-col rounded-2xl border border-neutral-200/80 bg-white p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-sm md:p-7">
                        <span class="font-mono text-[11px] font-semibold tracking-widest text-neutral-300 uppercase">
                            0{index + 1}
                        </span>
                        <p class="mt-4 font-mono text-[11px] font-semibold tracking-widest text-neutral-400 uppercase">
                            {item.targetKeyword}
                        </p>
                        <h3 class="mt-1 text-xl font-semibold tracking-tight text-neutral-950 group-hover:underline">
                            {item.name}
                        </h3>
                        <p class="mt-3 text-sm leading-6 text-neutral-500">{item.description}</p>
                        <p class="mt-5 text-sm font-medium text-neutral-700">
                            Compare
                            <span
                                class="inline-block transition-transform group-hover:translate-x-0.5"
                                aria-hidden="true">→</span>
                        </p>
                    </a>
                </li>
            {/each}
        </ul>
    </Container>
</section>
