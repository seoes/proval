<script lang="ts">
    import type { Competitor } from "../alternative/competitorList";
    import { DEMO_URL } from "../constants";
    import Breadcrumb from "./Breadcrumb.svelte";
    import ButtonLink from "./ButtonLink.svelte";
    import Container from "./Container.svelte";
    import Eyebrow from "./Eyebrow.svelte";
    import Panel from "./Panel.svelte";

    interface Props {
        competitor: Competitor;
    }

    let { competitor }: Props = $props();
</script>

<section class="relative -mt-[4.5rem] overflow-hidden border-b border-neutral-200" aria-labelledby="alternative-hero">
    <Container wide class="relative pt-[calc(4.5rem+5rem)] pb-16 md:pt-[calc(4.5rem+7rem)] md:pb-24">
        <div class="max-w-2xl">
            <Breadcrumb
                items={[
                    { name: "Home", href: "/" },
                    { name: "Alternatives", href: "/alternatives" },
                    { name: competitor.name },
                ]} />
            <Eyebrow class="mt-6">Alternatives</Eyebrow>
            <h1
                id="alternative-hero"
                class="mt-5 text-4xl leading-[1.02] font-semibold tracking-[-0.05em] text-neutral-950 md:text-6xl">
                {competitor.heroLead}
            </h1>
            <p class="mt-5 text-sm font-medium tracking-wide text-neutral-500 uppercase">
                Proval vs {competitor.name}
            </p>
            <p class="mt-5 max-w-xl text-base leading-7 text-neutral-600">{competitor.intro}</p>
            <div class="mt-8">
                <ButtonLink href="/" variant="primary" class="text-base">Try Proval</ButtonLink>
            </div>
        </div>
    </Container>
</section>

<section class="border-t border-neutral-200/80 bg-neutral-50/40 py-16 md:py-20" aria-labelledby="feature-heading">
    <Container wide>
        <Eyebrow>Features</Eyebrow>
        <h2 id="feature-heading" class="mt-3 text-3xl font-semibold tracking-[-0.035em] text-neutral-950 md:text-4xl">
            Proval vs {competitor.name}
        </h2>

        <Panel padded={false} class="mt-8 overflow-hidden bg-white">
            <div class="overflow-x-auto">
                <table class="w-full min-w-[36rem] border-collapse text-left text-sm">
                    <thead>
                        <tr class="border-b border-neutral-200 bg-neutral-50/90">
                            <th
                                class="px-5 py-3.5 font-mono text-[11px] font-semibold tracking-widest text-neutral-400 uppercase">
                                Feature
                            </th>
                            <th class="px-5 py-3.5 font-semibold text-neutral-700">{competitor.name}</th>
                            <th
                                class="bg-primary/[0.08] px-5 py-3.5 font-semibold text-primary ring-1 ring-primary/15 ring-inset">
                                Proval
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each competitor.featureRowList as row, index (row.label)}
                            <tr
                                class="border-b border-neutral-200/80 last:border-b-0 {index % 2 === 1
                                    ? 'bg-neutral-50/40'
                                    : 'bg-white'}">
                                <th class="px-5 py-3.5 font-medium text-neutral-950">{row.label}</th>
                                <td class="px-5 py-3.5 text-neutral-600">{row.competitor}</td>
                                <td
                                    class="bg-primary/[0.05] px-5 py-3.5 font-medium text-neutral-900 ring-1 ring-primary/10 ring-inset">
                                    {row.proval}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </Panel>
    </Container>
</section>

<section class="border-t border-neutral-200/80 py-16 md:py-20" aria-labelledby="capability-heading">
    <Container wide>
        <Eyebrow>Capabilities</Eyebrow>
        <h2
            id="capability-heading"
            class="mt-3 text-3xl font-semibold tracking-[-0.035em] text-neutral-950 md:text-4xl">
            What each tool can do
        </h2>

        <Panel padded={false} class="mt-8 overflow-hidden bg-white">
            <div class="overflow-x-auto">
                <table class="w-full min-w-[32rem] border-collapse text-left text-sm">
                    <thead>
                        <tr class="border-b border-neutral-200 bg-neutral-50/90">
                            <th
                                class="px-5 py-3.5 font-mono text-[11px] font-semibold tracking-widest text-neutral-400 uppercase">
                                Capability
                            </th>
                            <th class="px-5 py-3.5 text-center font-semibold text-neutral-700">{competitor.name}</th>
                            <th
                                class="bg-primary/[0.08] px-5 py-3.5 text-center font-semibold text-primary ring-1 ring-primary/15 ring-inset">
                                Proval
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each competitor.capabilityRowList as row, index (row.label)}
                            <tr
                                class="border-b border-neutral-200/80 last:border-b-0 {index % 2 === 1
                                    ? 'bg-neutral-50/40'
                                    : 'bg-white'}">
                                <th class="px-5 py-3.5 font-medium text-neutral-950">{row.label}</th>
                                <td class="px-5 py-3.5 text-center text-lg" aria-label={row.competitor ? "Yes" : "No"}>
                                    {row.competitor ? "✅" : "❌"}
                                </td>
                                <td
                                    class="bg-primary/[0.05] px-5 py-3.5 text-center text-lg ring-1 ring-primary/10 ring-inset"
                                    aria-label={row.proval ? "Yes" : "No"}>
                                    {row.proval ? "✅" : "❌"}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </Panel>
    </Container>
</section>

<section class="border-t border-neutral-200/80 bg-neutral-50/40 py-16 md:py-20" aria-labelledby="verdict-heading">
    <Container>
        <Eyebrow>Verdict</Eyebrow>
        <h2 id="verdict-heading" class="mt-3 text-3xl font-semibold tracking-[-0.035em] text-neutral-950 md:text-4xl">
            When to choose Proval over {competitor.name}
        </h2>
        <p class="mt-5 max-w-3xl text-base leading-7 text-neutral-600">{competitor.verdict}</p>
    </Container>
</section>

<section class="border-t border-neutral-200/80 bg-neutral-50 py-16 md:py-20" aria-labelledby="cta-heading">
    <Container>
        <Eyebrow>Next step</Eyebrow>
        <h2 id="cta-heading" class="mt-3 text-3xl font-semibold tracking-[-0.035em] text-neutral-950 md:text-4xl">
            Try Proval on your stack
        </h2>
        <div class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <ButtonLink href="/" variant="primary">Try Proval</ButtonLink>
            <ButtonLink href={DEMO_URL} variant="secondary" external>Demo</ButtonLink>
            <ButtonLink href="/alternatives" variant="ghost">All alternatives</ButtonLink>
        </div>
    </Container>
</section>
