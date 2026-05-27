<script lang="ts">
    import { siForgejo, siGithub, siGitlab } from "simple-icons";
    import type { SimpleIcon } from "simple-icons";
    import { twMerge } from "tailwind-merge";

    type GitProvider = "gitlab" | "github" | "forgejo";

    interface Props {
        provider: GitProvider;
        class?: string;
    }

    const { provider, class: className }: Props = $props();

    const icons: Record<GitProvider, SimpleIcon> = {
        gitlab: siGitlab,
        github: siGithub,
        forgejo: siForgejo,
    };

    const icon = $derived(icons[provider]);
</script>

<svg
    class={twMerge("size-5 shrink-0", className)}
    viewBox="0 0 24 24"
    fill={`#${icon.hex}`}
    aria-label={icon.title}
    role="img">
    <path d={icon.path} />
</svg>
