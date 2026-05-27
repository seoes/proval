<script lang="ts" module>
    export type SetupStepStatus = "complete" | "current" | "pending" | "blocked";

    export type SetupStep = {
        id: string;
        title: string;
        description: string;
        href: string;
        ctaLabel: string;
        manageLabel?: string;
        complete: boolean;
        blocked?: boolean;
        blockedReason?: string;
        status: SetupStepStatus;
    };
</script>

<script lang="ts">
    import Card from "$lib/components/layout/Card.svelte";
    import Button from "$lib/components/atom/Button.svelte";
    import { CheckCircleIcon, CircleIcon, LockIcon } from "phosphor-svelte";

    interface Props {
        steps: SetupStep[];
        completedCount: number;
        totalCount: number;
    }

    const { steps, completedCount, totalCount }: Props = $props();

    const progressPercent = $derived(totalCount > 0 ? (completedCount / totalCount) * 100 : 0);
</script>

<Card border title="Get started">
    <div class="space-y-6">
        <div class="space-y-2">
            <div class="flex items-center justify-between gap-4 text-sm">
                <p class="text-neutral-600 dark:text-neutral-400">
                    Complete these steps to start automated code reviews.
                </p>
                <span class="shrink-0 font-medium text-neutral-800 dark:text-neutral-200">
                    {completedCount} of {totalCount} complete
                </span>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                <div
                    class="h-full rounded-full bg-primary transition-all duration-300"
                    style="width: {progressPercent}%"></div>
            </div>
        </div>

        <div class="divide-y divide-neutral-200 dark:divide-neutral-700">
            {#each steps as step (step.id)}
                <div class="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <div class="flex min-w-0 items-start gap-3">
                        {#if step.status === "complete"}
                            <CheckCircleIcon
                                weight="fill"
                                class="mt-0.5 size-5 shrink-0 text-primary" />
                        {:else if step.status === "blocked"}
                            <LockIcon class="mt-0.5 size-5 shrink-0 text-neutral-400" />
                        {:else}
                            <CircleIcon
                                class="mt-0.5 size-5 shrink-0 {step.status === 'current'
                                    ? 'text-primary'
                                    : 'text-neutral-300 dark:text-neutral-600'}" />
                        {/if}

                        <div class="min-w-0 space-y-0.5">
                            <p
                                class="text-sm font-medium {step.status === 'complete'
                                    ? 'text-neutral-500'
                                    : 'text-neutral-800 dark:text-neutral-100'}">
                                {step.title}
                            </p>
                            <p class="text-sm text-neutral-500 dark:text-neutral-400">
                                {step.description}
                            </p>
                            {#if step.blocked && step.blockedReason}
                                <p class="text-xs text-neutral-400">{step.blockedReason}</p>
                            {/if}
                        </div>
                    </div>

                    <div class="shrink-0 pl-8 sm:pl-0">
                        {#if step.complete}
                            <a
                                href={step.href}
                                class="text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-800 dark:hover:text-neutral-200">
                                {step.manageLabel ?? "Manage →"}
                            </a>
                        {:else if step.blocked}
                            <Button secondary disabled class="px-4! py-2! text-sm">
                                {step.ctaLabel}
                            </Button>
                        {:else if step.status === "current"}
                            <a
                                href={step.href}
                                class="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90">
                                {step.ctaLabel}
                            </a>
                        {:else}
                            <a
                                href={step.href}
                                class="inline-flex items-center rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700">
                                {step.ctaLabel}
                            </a>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    </div>
</Card>
