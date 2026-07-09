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

<header class="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur">
    <div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
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
            <ButtonLink href={GITHUB_URL} variant="secondary" external class="hidden sm:inline-flex">GitHub</ButtonLink>
        </nav>
    </div>
</header>
