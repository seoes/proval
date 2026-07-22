<script lang="ts">
    import { DEFAULT_OG_IMAGE_PATH, SITE_NAME, SITE_URL } from "../constants";
    import { jsonLdString } from "../seo";

    interface Props {
        title: string;
        description: string;
        path: string;
        ogImagePath?: string;
        ogImageAlt?: string;
        type?: "website" | "article";
        publishedTime?: string;
        noindex?: boolean;
        jsonLd?: unknown | unknown[];
    }

    let {
        title,
        description,
        path,
        ogImagePath = DEFAULT_OG_IMAGE_PATH,
        ogImageAlt,
        type = "website",
        publishedTime,
        noindex = false,
        jsonLd,
    }: Props = $props();

    const canonical = $derived(`${SITE_URL}${path === "/" ? "" : path}`);
    const ogImage = $derived(`${SITE_URL}${ogImagePath}`);
    const imageAlt = $derived(ogImageAlt ?? title);
    const robots = $derived(noindex ? "noindex, follow" : "index, follow");
    const jsonLdBlocks = $derived(jsonLd === undefined ? [] : Array.isArray(jsonLd) ? jsonLd : [jsonLd]);

    function jsonLdHtml(data: unknown): string {
        return `<script type="application/ld+json">${jsonLdString(data)}</scr` + `ipt>`;
    }
</script>

<svelte:head>
    <title>{title}</title>
    <meta name="description" content={description} />
    <meta name="robots" content={robots} />
    <meta name="theme-color" content="#2563eb" />
    <link rel="canonical" href={canonical} />

    <meta property="og:type" content={type} />
    <meta property="og:site_name" content={SITE_NAME} />
    <meta property="og:locale" content="en_US" />
    <meta property="og:url" content={canonical} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:image" content={ogImage} />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content={imageAlt} />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={description} />
    <meta name="twitter:image" content={ogImage} />
    <meta name="twitter:image:alt" content={imageAlt} />

    {#if type === "article" && publishedTime}
        <meta property="article:published_time" content={publishedTime} />
    {/if}

    {#each jsonLdBlocks as block (JSON.stringify(block))}
        {@html jsonLdHtml(block)}
    {/each}
</svelte:head>
