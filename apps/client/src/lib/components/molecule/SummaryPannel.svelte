<script lang="ts" module>
    export type SummaryStatus = "ok" | "error" | "neutral";
</script>

<script lang="ts">
    interface Props {
        label: string;
        value: string | number;
        sublabel?: string;
        href?: string;
        actionLabel?: string;
        navHref?: string;
        status?: SummaryStatus;
    }

    const { label, value, sublabel, href, actionLabel, navHref, status }: Props = $props();

    const statusDotClass: Record<SummaryStatus, string> = {
        ok: "bg-emerald-500",
        error: "bg-red-500",
        neutral: "bg-neutral-300 dark:bg-neutral-600",
    };

    const cardClass =
        "rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800";
    const navLinkClass = `${cardClass} block transition-colors hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:hover:bg-neutral-700/50`;
</script>

{#snippet cardBody()}
    <p class="text-sm text-neutral-500 dark:text-neutral-400">{label}</p>

    <div class="mt-2 flex items-center gap-2">
        {#if status}
            <span class="size-2 shrink-0 rounded-full {statusDotClass[status]}" aria-hidden="true"></span>
        {/if}
        <p class="text-2xl font-semibold tracking-tight text-neutral-800 dark:text-neutral-100">{value}</p>
    </div>

    {#if sublabel}
        <p class="mt-1 text-xs text-neutral-400">{sublabel}</p>
    {/if}

    {#if href && actionLabel}
        <a
            {href}
            class="mt-3 inline-block text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-800 dark:hover:text-neutral-200">
            {actionLabel}
        </a>
    {/if}
{/snippet}

{#if navHref}
    <a href={navHref} class={navLinkClass}>
        {@render cardBody()}
    </a>
{:else}
    <div class={cardClass}>
        {@render cardBody()}
    </div>
{/if}
