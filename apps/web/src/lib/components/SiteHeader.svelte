<script lang="ts">
    import { page } from "$app/stores";
    import ButtonLink from "./ButtonLink.svelte";
    import { GITHUB_URL, DEMO_URL } from "../constants";

    const links = [
        { href: "/docs", label: "Docs" },
        { href: "/blog", label: "Blog" },
        { href: DEMO_URL, label: "Demo", external: true },
    ];
</script>

<header class="sticky top-3 z-20 mx-auto mt-3 w-[min(100%-1.5rem,80rem)]">
    <div
        class="flex h-12 items-center justify-between rounded-full border border-neutral-200/80 bg-white/90 px-5 shadow-lg shadow-neutral-900/8 backdrop-blur sm:px-6">
        <a href="/" class="text-lg font-semibold tracking-tight text-neutral-950">Proval</a>
        <nav class="flex items-center gap-4 text-sm sm:gap-6">
            {#each links as link (link.href)}
                <a
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noopener noreferrer" : undefined}
                    class={$page.url.pathname.startsWith(link.href)
                        ? "font-medium text-primary"
                        : "text-neutral-600 hover:text-neutral-900"}>
                    {link.label}
                </a>
            {/each}
            <ButtonLink href={GITHUB_URL} variant="secondary" external class="hidden h-8 rounded-full sm:inline-flex"
                >GitHub</ButtonLink>
        </nav>
    </div>
</header>
