<script lang="ts">
    import { GITHUB_URL, DEMO_URL } from "../constants";

    const year = new Date().getFullYear();

    const product = [
        { href: "/docs", label: "Docs" },
        { href: "/docs/quick-start", label: "Quick start" },
        { href: "/blog", label: "Blog" },
    ];

    const connect = [
        { href: DEMO_URL, label: "Demo", external: true },
        { href: GITHUB_URL, label: "GitHub", external: true },
    ];
</script>

<footer class="pb-10 pt-8 md:pb-12 md:pt-4">
    <div class="mx-auto w-[min(100%-1.5rem,80rem)]">
        <div
            class="relative overflow-hidden rounded-2xl border border-neutral-200/80 bg-neutral-50/70 px-6 py-8 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)] sm:px-8 sm:py-10 md:rounded-3xl md:px-10">
            <div
                class="pointer-events-none absolute inset-x-6 top-0 h-px bg-linear-to-r from-transparent via-primary/30 to-transparent"
                aria-hidden="true">
            </div>
            <div class="grid gap-10 md:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,0.7fr))] md:gap-12">
                <div>
                    <a href="/" class="text-lg font-semibold tracking-tight text-neutral-950">Proval</a>
                    <p class="mt-3 max-w-sm text-sm leading-6 text-neutral-500">
                        Self-hosted AI code review for GitLab, Forgejo, and GitHub. Bring your own model.
                    </p>
                </div>

                <div>
                    <p class="font-mono text-[11px] font-semibold tracking-widest text-neutral-400 uppercase">
                        Product
                    </p>
                    <ul class="mt-4 space-y-2.5 text-sm">
                        {#each product as link (link.href)}
                            <li>
                                <a href={link.href} class="text-neutral-600 transition-colors hover:text-neutral-950"
                                    >{link.label}</a>
                            </li>
                        {/each}
                    </ul>
                </div>

                <div>
                    <p class="font-mono text-[11px] font-semibold tracking-widest text-neutral-400 uppercase">
                        Connect
                    </p>
                    <ul class="mt-4 space-y-2.5 text-sm">
                        {#each connect as link (link.href)}
                            <li>
                                <a
                                    href={link.href}
                                    target={link.external ? "_blank" : undefined}
                                    rel={link.external ? "noopener noreferrer" : undefined}
                                    class="text-neutral-600 transition-colors hover:text-neutral-950">{link.label}</a>
                            </li>
                        {/each}
                    </ul>
                </div>
            </div>

            <div
                class="mt-10 flex flex-col gap-2 border-t border-neutral-200/80 pt-6 text-xs text-neutral-400 sm:flex-row sm:items-center sm:justify-between">
                <p>© {year} Proval</p>
                <p>Open source. Self-hosted. Bring your own model.</p>
            </div>
        </div>
    </div>
</footer>
