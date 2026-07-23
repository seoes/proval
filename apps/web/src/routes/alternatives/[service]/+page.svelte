<script lang="ts">
    import AlternativeCompare from "../../../lib/components/AlternativeCompare.svelte";
    import SeoHead from "../../../lib/components/SeoHead.svelte";
    import { breadcrumbLd, comparisonPageLd } from "../../../lib/seo";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    const { competitor } = $derived(data);
    const path = $derived(`/alternatives/${competitor.slug}`);
</script>

<SeoHead
    title={competitor.title}
    description={competitor.description}
    {path}
    ogImagePath={competitor.ogImagePath}
    ogImageAlt={`Proval vs ${competitor.name}`}
    jsonLd={[
        breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Alternatives", path: "/alternatives" },
            { name: competitor.name, path },
        ]),
        comparisonPageLd({
            name: competitor.title,
            description: competitor.description,
            path,
            competitor: competitor.name,
        }),
    ]} />

<AlternativeCompare {competitor} />
