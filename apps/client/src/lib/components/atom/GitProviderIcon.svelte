<script lang="ts">
    import { siForgejo, siGitea, siGithub, siGitlab } from "simple-icons";
    import type { SimpleIcon } from "simple-icons";
    import type { RepositoryProvider } from "@proval/types";
    import { twMerge } from "tailwind-merge";

    interface Props {
        provider: RepositoryProvider;
        class?: string;
        iconClass?: string;
        style?: string;
        boxed?: boolean;
    }

    const { provider, class: className, iconClass, style, boxed = false }: Props = $props();

    const icons: Record<RepositoryProvider, SimpleIcon> = {
        gitlab: siGitlab,
        github: siGithub,
        forgejo: siForgejo,
        gitea: siGitea,
    };

    const icon = $derived(icons[provider]);
    const fill = $derived(provider === "github" ? "currentColor" : `#${icon.hex}`);
</script>

{#if boxed}
    <div class={twMerge("flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted", className)}>
        <svg
            class={twMerge("size-5 shrink-0 text-foreground", iconClass)}
            {style}
            viewBox="0 0 24 24"
            {fill}
            aria-label={icon.title}
            role="img">
            <path d={icon.path} />
        </svg>
    </div>
{:else}
    <svg
        class={twMerge("size-5 shrink-0 text-foreground", className)}
        {style}
        viewBox="0 0 24 24"
        {fill}
        aria-label={icon.title}
        role="img">
        <path d={icon.path} />
    </svg>
{/if}
