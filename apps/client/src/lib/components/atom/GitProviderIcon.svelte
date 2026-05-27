<script lang="ts">
    import { siForgejo, siGithub, siGitlab } from "simple-icons";
    import type { SimpleIcon } from "simple-icons";
    import type { RepositoryProvider } from "@proval/types";
    import { twMerge } from "tailwind-merge";

    interface Props {
        provider: RepositoryProvider;
        class?: string;
        iconClass?: string;
        boxed?: boolean;
    }

    const { provider, class: className, iconClass, boxed = false }: Props = $props();

    const icons: Record<RepositoryProvider, SimpleIcon> = {
        gitlab: siGitlab,
        github: siGithub,
        forgejo: siForgejo,
    };

    const icon = $derived(icons[provider]);
</script>

{#if boxed}
    <div
        class={twMerge(
            "flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800",
            className,
        )}>
        <svg
            class={twMerge("size-5 shrink-0", iconClass)}
            viewBox="0 0 24 24"
            fill={`#${icon.hex}`}
            aria-label={icon.title}
            role="img">
            <path d={icon.path} />
        </svg>
    </div>
{:else}
    <svg
        class={twMerge("size-5 shrink-0", className)}
        viewBox="0 0 24 24"
        fill={`#${icon.hex}`}
        aria-label={icon.title}
        role="img">
        <path d={icon.path} />
    </svg>
{/if}
