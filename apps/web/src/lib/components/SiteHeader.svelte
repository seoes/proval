<script lang="ts">
    import { page } from "$app/state";
    import Proval from "../icons/Proval.svelte";
    import ButtonLink from "./ButtonLink.svelte";
    import { GITHUB_URL, DEMO_URL } from "../constants";

    let menuOpen = $state(false);

    const links = [
        { href: "/docs", label: "Docs" },
        { href: DEMO_URL, label: "Demo", external: true },
    ];

    function isActive(pathname: string, href: string, external?: boolean): boolean {
        if (external) return false;
        return pathname === href || pathname.startsWith(`${href}/`);
    }

    function closeMenu() {
        menuOpen = false;
    }
</script>

<a
    href="#main-content"
    class="sr-only bg-primary text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:px-4 focus:py-2 focus:outline-none">
    Skip to content
</a>

<header class="sticky top-3 z-20 mx-auto mt-3 w-[min(100%-1.5rem,80rem)]">
    <div
        class="flex h-12 items-center justify-between rounded-full border border-neutral-200/80 bg-white/90 px-5 shadow-lg shadow-neutral-900/8 backdrop-blur sm:px-6">
        <a
            href="/"
            class="inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-neutral-950"
            onclick={closeMenu}>
            <Proval class="size-6" />
            Proval
        </a>
        <nav class="hidden items-center gap-4 text-sm sm:flex sm:gap-6">
            {#each links as link (link.href)}
                <a
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noopener noreferrer" : undefined}
                    class={isActive(page.url.pathname, link.href, link.external)
                        ? "font-medium text-primary"
                        : "text-neutral-600 hover:text-neutral-900"}>
                    {link.label}
                </a>
            {/each}
            <ButtonLink href={GITHUB_URL} variant="secondary" external class="h-8 rounded-full">GitHub</ButtonLink>
        </nav>
        <button
            type="button"
            class="inline-flex size-8 items-center justify-center rounded-full border border-neutral-200 text-neutral-700 sm:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onclick={() => (menuOpen = !menuOpen)}>
            <span class="sr-only">{menuOpen ? "Close" : "Menu"}</span>
            <span aria-hidden="true" class="font-mono text-sm">{menuOpen ? "×" : "☰"}</span>
        </button>
    </div>
    {#if menuOpen}
        <nav
            id="mobile-nav"
            class="mt-2 rounded-2xl border border-neutral-200/80 bg-white/95 p-3 shadow-lg shadow-neutral-900/8 backdrop-blur sm:hidden">
            <ul class="space-y-1 text-sm">
                {#each links as link (link.href)}
                    <li>
                        <a
                            href={link.href}
                            target={link.external ? "_blank" : undefined}
                            rel={link.external ? "noopener noreferrer" : undefined}
                            class="block rounded-lg px-3 py-2.5 text-neutral-700 hover:bg-neutral-50 hover:text-neutral-950"
                            onclick={closeMenu}>
                            {link.label}
                        </a>
                    </li>
                {/each}
                <li>
                    <a
                        href={GITHUB_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="block rounded-lg px-3 py-2.5 text-neutral-700 hover:bg-neutral-50 hover:text-neutral-950"
                        onclick={closeMenu}>
                        GitHub
                    </a>
                </li>
            </ul>
        </nav>
    {/if}
</header>
