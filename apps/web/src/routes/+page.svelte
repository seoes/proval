<script lang="ts">
    import { fade } from "svelte/transition";
    import Container from "../lib/components/Container.svelte";
    import Eyebrow from "../lib/components/Eyebrow.svelte";
    import Button from "../lib/components/Button.svelte";
    import ButtonLink from "../lib/components/ButtonLink.svelte";
    import { GITHUB_URL, SITE_DESCRIPTION } from "../lib/constants";

    type StageKind = "context" | "policy" | "plan" | "parallel" | "output";

    type Stage = {
        title: string;
        kind: StageKind;
        items?: readonly string[];
        subtitle?: string;
    };

    const stageKindStyle: Record<
        StageKind,
        { ring: string; badge: string; badgeText: string; dot: string; itemRing: string; itemBg: string }
    > = {
        context: {
            ring: "ring-sky-200/80",
            badge: "bg-sky-50",
            badgeText: "text-sky-700",
            dot: "bg-sky-400/70",
            itemRing: "ring-sky-100/80",
            itemBg: "bg-sky-50/60",
        },
        policy: {
            ring: "ring-amber-200/80",
            badge: "bg-amber-50",
            badgeText: "text-amber-700",
            dot: "bg-amber-400/70",
            itemRing: "ring-amber-100/80",
            itemBg: "bg-amber-50/60",
        },
        plan: {
            ring: "ring-violet-200/80",
            badge: "bg-violet-50",
            badgeText: "text-violet-700",
            dot: "bg-violet-400/70",
            itemRing: "ring-violet-100/80",
            itemBg: "bg-violet-50/60",
        },
        parallel: {
            ring: "ring-primary/25",
            badge: "bg-primary/10",
            badgeText: "text-primary",
            dot: "bg-primary/45",
            itemRing: "ring-primary/10",
            itemBg: "bg-primary/5",
        },
        output: {
            ring: "ring-emerald-200/70",
            badge: "bg-emerald-50",
            badgeText: "text-emerald-700",
            dot: "bg-emerald-400/70",
            itemRing: "ring-emerald-100/80",
            itemBg: "bg-emerald-50/60",
        },
    };
    type ReviewMode = {
        id: string;
        label: string;
        tagline: string;
        stages: readonly Stage[];
    };

    const reviewModeList: readonly ReviewMode[] = [
        {
            id: "standard",
            label: "Standard Review",
            tagline: "Runs on every merge request",
            stages: [
                {
                    title: "Load Context",
                    kind: "context",
                    items: ["PR Metadata", "Git Diff", "Existing code"],
                },
                { title: "Review", kind: "output" },
            ],
        },
        {
            id: "deep",
            label: "Deep Research Review",
            tagline: "Each file group gets a sub-agent",
            stages: [
                {
                    title: "Load Context",
                    kind: "context",
                    items: ["PR Metadata", "Git Diff", "Existing code"],
                },
                {
                    title: "Plan Agent",
                    kind: "plan",
                    subtitle: "Group related files",
                },
                {
                    title: "Review",
                    kind: "parallel",
                    items: ["Review Agent", "Review Agent", "More..."],
                    subtitle: "Concurrent agents",
                },
                { title: "Writing Agent", kind: "output" },
            ],
        },
        {
            id: "reply",
            label: "Comment Reply",
            tagline: "Agent answers your comments",
            stages: [
                { title: "Policy check", kind: "policy" },
                { title: "Load context", kind: "context" },
                { title: "Reply", kind: "output" },
            ],
        },
    ];

    const screenshots = [
        {
            id: "dashboard",
            label: "Dashboard",
            frame: "proval.local",
            caption: "Every review run, model, and connected repository in one place.",
        },
        {
            id: "setup",
            label: "Setup",
            frame: "proval.local/settings",
            caption: "Connect a model endpoint and a repository with a simple form.",
        },
        {
            id: "review",
            label: "Review",
            frame: "gitlab.com/acme/api-server/-/merge_requests/42",
            caption: "Proval posts a summary and inline comments straight to the merge request.",
        },
    ] as const;

    const faqs = [
        {
            question: "Is Proval a replacement for Cursor, Copilot, or Claude?",
            answer: "No Those tools are strong agents on IDE(or Cli) for individual developers. Proval is a team review layer on your Git host. Reviews and replies appear on pull requests and issues, and you can choose any model API you want.",
        },
        {
            question: "Does code leave our infrastructure?",
            answer: "Proval does not store your code. It only sends review context to the LLM endpoint you configure. Use a local model if you need to keep everything on your network.",
        },
    ] as const;

    const dockerCompose = `services:
    proval:
        image: ghcr.io/proval/proval:latest
        ports:
            - "7900:7900"
            - "7901:7901"
        volumes:
            - proval-data:/data
            
volumes:
    proval-data:`;

    let copyLabel = $state("Copy");

    let activeShot = $state<(typeof screenshots)[number]["id"]>(screenshots[0].id);
    const currentShot = $derived(screenshots.find((shot) => shot.id === activeShot) ?? screenshots[0]);

    let activeMode = $state(reviewModeList[0].id);
    const currentMode = $derived(reviewModeList.find((mode) => mode.id === activeMode) ?? reviewModeList[0]);

    async function copyDockerCompose() {
        try {
            await navigator.clipboard.writeText(dockerCompose);
            copyLabel = "Copied";
            setTimeout(() => {
                copyLabel = "Copy";
            }, 2000);
        } catch {
            copyLabel = "Failed";
            setTimeout(() => {
                copyLabel = "Copy";
            }, 2000);
        }
    }
</script>

<svelte:head>
    <title>Proval - Self-hosted AI code review infrastructure</title>
    <meta name="description" content={SITE_DESCRIPTION} />
</svelte:head>

<section class="overflow-hidden border-b border-neutral-200 bg-white">
    <Container wide class="pt-20 pb-16 text-center md:pt-28 md:pb-24">
        <!-- <Eyebrow>Privacy-first review automation</Eyebrow> -->
        <Eyebrow>Your Code, Your Model</Eyebrow>
        <h1
            class="mx-auto mt-5 max-w-4xl text-4xl leading-tight font-semibold tracking-[-0.045em] text-neutral-950 md:text-6xl">
            Self-hosted AI Code Review agent on <span class="text-primary">your infrastructure</span>
            <!-- <span class="text-primary">Self-hosted</span> AI Code Review agent on your infrastructure -->
        </h1>
        <p class="mx-auto mt-6 max-w-2xl text-lg leading-8 text-neutral-600">
            Works with GitLab, Forgejo, and GitHub. Use your local model or any API you want.
        </p>

        <div class="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <ButtonLink href="/docs/quick-start" variant="primary">Read the docs</ButtonLink>
            <ButtonLink href={GITHUB_URL} variant="secondary" external>View on GitHub</ButtonLink>
        </div>

        <div class="mx-auto mt-16 w-full max-w-5xl">
            <div
                class="overflow-hidden max-md:rounded-lg md:mt-6 md:rounded-2xl md:border md:border-neutral-200 md:bg-neutral-100 md:p-2 md:shadow-2xl md:shadow-neutral-900/10">
                <div
                    class="overflow-hidden max-md:rounded-lg md:rounded-xl md:border md:border-neutral-200 md:bg-white">
                    <div class="hidden h-10 items-center gap-2 border-b border-neutral-200 px-4 md:flex">
                        <span class="size-2.5 rounded-full bg-red-300"></span>
                        <span class="size-2.5 rounded-full bg-amber-300"></span>
                        <span class="size-2.5 rounded-full bg-emerald-300"></span>
                        <span class="ml-3 truncate font-mono text-xs text-neutral-500">{currentShot.frame}</span>
                    </div>
                    <img
                        src={`/${currentShot.id}.png`}
                        alt={currentShot.label}
                        class="aspect-16/10 w-full object-cover" />
                </div>
            </div>

            <p class="mt-4 text-center text-sm text-neutral-500">{currentShot.caption}</p>

            <div
                class="mt-4 inline-flex rounded-lg border border-neutral-200/70 bg-neutral-100/50 p-1"
                role="tablist"
                aria-label="Screenshot preview">
                {#each screenshots as shot (shot.id)}
                    <Button variant="segment" pressed={activeShot === shot.id} onclick={() => (activeShot = shot.id)}>
                        {shot.label}
                    </Button>
                {/each}
            </div>
        </div>
    </Container>
</section>

<section class="border-b border-neutral-200 bg-white py-20 md:py-28">
    <Container wide class="max-w-6xl">
        <div class="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-end">
            <div>
                <Eyebrow>Integration</Eyebrow>
                <h2 class="mt-3 text-3xl font-semibold tracking-tight text-neutral-950 md:text-4xl">
                    Plug into the Git host you already run.
                </h2>
            </div>
            <p class="text-neutral-600 lg:text-right">
                Webhooks and host APIs connect your Git instance to Proval. Proval sends review context to the LLM
                endpoint you configure — all on infrastructure you control.
            </p>
        </div>

        <div
            class="relative mt-12 overflow-hidden rounded-2xl border border-neutral-200/80 bg-neutral-50 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)] md:p-8">
            <div class="flex flex-col gap-6 xl:flex-row xl:items-stretch xl:gap-4">
                <div class="flex w-full flex-col xl:w-48 2xl:w-52">
                    <p class="mb-3 font-mono text-[10px] font-semibold tracking-widest text-neutral-400 uppercase">
                        Git provider
                    </p>
                    <div
                        class="flex flex-1 flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm xl:min-h-0">
                        <ul class="space-y-2">
                            <li
                                class="flex items-center gap-3 rounded-lg border border-neutral-100 bg-neutral-50/80 px-3 py-2.5">
                                <span
                                    class="flex size-8 shrink-0 items-center justify-center rounded-md bg-neutral-900 font-mono text-[11px] font-bold text-white"
                                    >GH</span>
                                <div class="min-w-0">
                                    <p class="text-sm font-medium text-neutral-900">GitHub</p>
                                    <p class="text-[11px] text-neutral-500">GitHub App</p>
                                </div>
                            </li>
                            <li
                                class="flex items-center gap-3 rounded-lg border border-neutral-100 bg-neutral-50/80 px-3 py-2.5">
                                <span
                                    class="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#FC6D26] font-mono text-[11px] font-bold text-white"
                                    >GL</span>
                                <div class="min-w-0">
                                    <p class="text-sm font-medium text-neutral-900">GitLab</p>
                                    <p class="text-[11px] text-neutral-500">Access Token</p>
                                </div>
                            </li>
                            <li
                                class="flex items-center gap-3 rounded-lg border border-neutral-100 bg-neutral-50/80 px-3 py-2.5">
                                <span
                                    class="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#FB923C] font-mono text-[11px] font-bold text-white"
                                    >Fj</span>
                                <div class="min-w-0">
                                    <p class="text-sm font-medium text-neutral-900">Forgejo</p>
                                    <p class="text-[11px] text-neutral-500">Access Token</p>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>

                <div class="grid min-w-0 flex-1 grid-cols-2 gap-3 xl:hidden" aria-hidden="true">
                    <div class="flex flex-col items-center">
                        <div class="integration-line-v-blue h-5" aria-hidden="true"></div>
                        <div class="w-full px-1 py-1 text-center">
                            <p class="font-mono text-[10px] font-semibold tracking-widest text-sky-600 uppercase">
                                Webhook
                            </p>
                            <div class="mt-2 flex flex-col items-center gap-1.5">
                                <span
                                    class="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 font-mono text-[10px] text-sky-700"
                                    >merge_request.opened</span>
                                <span
                                    class="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 font-mono text-[10px] text-sky-700"
                                    >note.created</span>
                            </div>
                        </div>
                        <div class="integration-line-v-blue h-5" aria-hidden="true"></div>
                    </div>
                    <div class="flex flex-col items-center">
                        <div class="integration-line-v-green h-5" aria-hidden="true"></div>
                        <div class="w-full px-1 py-1 text-center">
                            <p class="font-mono text-[10px] font-semibold tracking-widest text-emerald-600 uppercase">
                                HTTP API
                            </p>
                            <div class="mt-2 flex flex-col items-center gap-1.5">
                                <span
                                    class="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 font-mono text-[10px] text-emerald-700"
                                    >GET /repository</span>
                                <span
                                    class="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 font-mono text-[10px] text-emerald-700"
                                    >POST /comment</span>
                            </div>
                        </div>
                        <div class="integration-line-v-green h-5" aria-hidden="true"></div>
                    </div>
                </div>

                <div class="hidden min-w-0 flex-1 flex-col justify-center gap-8 xl:flex 2xl:gap-10" aria-hidden="true">
                    <div class="flex w-full items-center">
                        <div class="integration-line-h-blue min-w-4 flex-1" aria-hidden="true"></div>
                        <div class="mx-auto w-max shrink-0 px-1 py-1 text-center">
                            <p class="font-mono text-[10px] font-semibold tracking-widest text-sky-600 uppercase">
                                Webhook
                            </p>
                            <div class="mt-2 flex flex-col items-center gap-1">
                                <span
                                    class="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 font-mono text-[9px] leading-4 text-sky-700 xl:text-[10px]"
                                    >merge_request.opened</span>
                                <span
                                    class="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 font-mono text-[9px] leading-4 text-sky-700 xl:text-[10px]"
                                    >note.created</span>
                            </div>
                        </div>
                        <div class="integration-line-h-blue min-w-4 flex-1" aria-hidden="true"></div>
                    </div>
                    <div class="flex w-full items-center">
                        <div class="integration-line-h-green min-w-4 flex-1" aria-hidden="true"></div>
                        <div class="mx-auto w-max shrink-0 px-1 py-1 text-center">
                            <p class="font-mono text-[10px] font-semibold tracking-widest text-emerald-600 uppercase">
                                HTTP API
                            </p>
                            <div class="mt-2 flex flex-col items-center gap-1">
                                <span
                                    class="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[9px] leading-4 text-emerald-700 xl:text-[10px]"
                                    >GET /repository</span>
                                <span
                                    class="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[9px] leading-4 text-emerald-700 xl:text-[10px]"
                                    >POST /comment</span>
                            </div>
                        </div>
                        <div class="integration-line-h-green min-w-4 flex-1" aria-hidden="true"></div>
                    </div>
                </div>

                <div class="flex w-full flex-col xl:w-48 2xl:w-52">
                    <p class="mb-3 font-mono text-[10px] font-semibold tracking-widest text-neutral-400 uppercase">
                        Proval
                    </p>
                    <div
                        class="flex flex-1 flex-col rounded-xl border border-primary/20 bg-white p-4 shadow-sm ring-1 ring-primary/10 xl:min-h-0">
                        <div class="flex items-start gap-3">
                            <span
                                class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary font-mono text-sm font-bold text-white"
                                >Pv</span>
                            <div class="min-w-0">
                                <p class="text-sm font-semibold text-neutral-900">Review Agent</p>
                                <p class="mt-1 text-[11px] leading-relaxed text-neutral-500">Runs Agent loop</p>
                            </div>
                        </div>
                        <ul class="mt-3 space-y-1.5 border-t border-neutral-100 pt-3">
                            <li
                                class="flex items-center justify-between gap-2 rounded-md bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-600">
                                <span>Dashboard</span>
                                <span class="font-mono text-neutral-700">:7900</span>
                            </li>
                            <li
                                class="flex items-center justify-between gap-2 rounded-md bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-600">
                                <span>Webhook</span>
                                <span class="font-mono text-sky-600">:7901</span>
                            </li>
                        </ul>
                    </div>
                </div>

                <div class="flex min-w-0 flex-1 flex-col items-center xl:hidden" aria-hidden="true">
                    <div class="integration-line-v-violet h-5" aria-hidden="true"></div>
                    <div class="w-full px-2 py-1 text-center">
                        <p class="font-mono text-[10px] font-semibold tracking-widest text-violet-600 uppercase">
                            LLM API
                        </p>
                        <div class="mt-2 flex flex-col items-center gap-1.5">
                            <span
                                class="rounded-md border border-violet-200 bg-violet-50 px-2 py-1 font-mono text-[10px] text-violet-700"
                                >Chat Completions API</span>
                            <span
                                class="rounded-md border border-violet-200 bg-violet-50 px-2 py-1 font-mono text-[10px] text-violet-700"
                                >Messages API</span>
                        </div>
                    </div>
                    <div class="integration-line-v-violet h-5" aria-hidden="true"></div>
                </div>

                <div class="hidden min-w-0 flex-1 items-center xl:flex" aria-hidden="true">
                    <div class="integration-line-h-violet min-w-4 flex-1" aria-hidden="true"></div>
                    <div class="mx-auto w-max shrink-0 px-1 py-1 text-center">
                        <p class="font-mono text-[10px] font-semibold tracking-widest text-violet-600 uppercase">
                            LLM API
                        </p>
                        <div class="mt-2 flex flex-col items-center gap-1">
                            <span
                                class="rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 font-mono text-[9px] leading-4 text-violet-700 xl:text-[10px]"
                                >Chat Completions API</span>
                            <span
                                class="rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 font-mono text-[9px] leading-4 text-violet-700 xl:text-[10px]"
                                >Messages API</span>
                        </div>
                    </div>
                    <div class="integration-line-h-violet min-w-4 flex-1" aria-hidden="true"></div>
                </div>

                <div class="flex w-full flex-col xl:w-48 2xl:w-52">
                    <p class="mb-3 font-mono text-[10px] font-semibold tracking-widest text-neutral-400 uppercase">
                        LLM
                    </p>
                    <div
                        class="flex flex-1 flex-col rounded-xl border border-violet-200/80 bg-white p-4 shadow-sm ring-1 ring-violet-100 xl:min-h-0">
                        <ul class="space-y-2">
                            <li
                                class="flex items-center gap-3 rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2.5">
                                <span
                                    class="flex size-8 shrink-0 items-center justify-center rounded-md bg-violet-600 font-mono text-[11px] font-bold text-white"
                                    >Lc</span>
                                <span class="text-sm font-medium text-neutral-900">Llama.cpp</span>
                            </li>
                            <li
                                class="flex items-center gap-3 rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2.5">
                                <span
                                    class="flex size-8 shrink-0 items-center justify-center rounded-md bg-neutral-900 font-mono text-[11px] font-bold text-white"
                                    >OA</span>
                                <span class="text-sm font-medium text-neutral-900">OpenAI-compatible</span>
                            </li>
                            <li
                                class="flex items-center gap-3 rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2.5">
                                <span
                                    class="flex size-8 shrink-0 items-center justify-center rounded-md bg-indigo-600 font-mono text-[11px] font-bold text-white"
                                    >OR</span>
                                <span class="text-sm font-medium text-neutral-900">OpenRouter</span>
                            </li>
                            <li
                                class="flex items-center gap-3 rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2.5">
                                <span
                                    class="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#CC785C] font-mono text-[11px] font-bold text-white"
                                    >An</span>
                                <span class="text-sm font-medium text-neutral-900">Anthropic</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            <div class="mt-6 space-y-1.5 px-1 text-xs leading-5 text-neutral-500">
                <p>
                    <span class="font-semibold text-neutral-950">Gitea</span> and
                    <span class="font-semibold text-neutral-950">Codeberg</span> use the same Forgejo-compatible webhook and
                    API path.
                </p>
                <p>
                    Public webhooks may need nginx or Caddy in front of Proval for
                    <span class="font-semibold text-neutral-950">HTTPS</span> (TLS).
                </p>
            </div>
        </div>
    </Container>
</section>

{#snippet stageNode(stage: Stage, step: number)}
    {@const style = stageKindStyle[stage.kind]}
    {#if stage.items?.length || stage.subtitle}
        <div
            class={[
                "relative w-full shrink-0 rounded-xl bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 md:w-auto",
                style.ring,
            ]}>
            <div class="flex items-center gap-2.5 border-neutral-100">
                <div
                    class={[
                        "flex size-8 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-semibold tabular-nums",
                        style.badge,
                        style.badgeText,
                    ]}>
                    {String(step).padStart(2, "0")}
                </div>
                <div>
                    <p class="text-sm font-semibold tracking-tight text-neutral-900">{stage.title}</p>
                    {#if stage.subtitle}
                        <p class="text-[11px] text-neutral-400">{stage.subtitle}</p>
                    {/if}
                </div>
            </div>
            {#if stage.items?.length}
                <div class="mt-2.5 flex flex-col gap-1.5 border-t border-neutral-100 pt-2.5">
                    {#each stage.items as label, j (j)}
                        <div
                            class={[
                                "flex items-center gap-2.5 rounded-lg px-3 py-2 ring-1",
                                style.itemBg,
                                style.itemRing,
                            ]}>
                            <span class={["size-1.5 shrink-0 rounded-full", style.dot]}></span>
                            <span class="font-mono text-[11px] font-medium text-neutral-600">{label}</span>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {:else}
        <div
            class={[
                "relative flex w-full shrink-0 items-center gap-3 rounded-xl bg-white py-2 pr-4 pl-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 md:w-auto",
                style.ring,
            ]}>
            <div
                class={[
                    "flex size-8 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-semibold tabular-nums",
                    style.badge,
                    style.badgeText,
                ]}>
                {String(step).padStart(2, "0")}
            </div>
            <span class="text-sm font-semibold tracking-tight whitespace-nowrap text-neutral-900">{stage.title}</span>
        </div>
    {/if}
{/snippet}

{#snippet modeOption(mode: ReviewMode, active: boolean)}
    <button
        type="button"
        onclick={() => (activeMode = mode.id)}
        aria-pressed={active}
        class={[
            "flex w-full shrink-0 items-start gap-2.5 rounded-xl p-3 text-left ring-1 transition-all duration-200 lg:w-max",
            active
                ? "bg-neutral-50 ring-neutral-200/90"
                : "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-neutral-200/90 hover:ring-neutral-300",
        ]}>
        <span
            class={["mt-1.5 size-2 shrink-0 rounded-full transition-colors", active ? "bg-primary" : "bg-neutral-300"]}
            aria-hidden="true"></span>
        <div class="min-w-0">
            <p class="text-sm font-semibold tracking-tight text-neutral-900">{mode.label}</p>
            <p class="mt-0.5 text-xs leading-relaxed text-neutral-500">{mode.tagline}</p>
        </div>
    </button>
{/snippet}

{#snippet flowEdge()}
    <div class="hidden shrink-0 items-center px-0.5 md:flex" aria-hidden="true">
        <div class="h-px w-4 bg-neutral-200"></div>
        <div class="size-1.5 shrink-0 rounded-full bg-primary/40"></div>
        <div class="h-px w-4 bg-linear-to-r from-neutral-200 to-primary/25"></div>
        <svg class="size-3.5 shrink-0 text-primary/60" viewBox="0 0 16 16" fill="none">
            <path
                d="M6 3l5 5-5 5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round" />
        </svg>
    </div>
    <div class="flex shrink-0 flex-col items-center py-0.5 md:hidden" aria-hidden="true">
        <div class="h-3 w-px bg-neutral-200"></div>
        <div class="size-1.5 shrink-0 rounded-full bg-primary/40"></div>
        <div class="h-3 w-px bg-linear-to-b from-neutral-200 to-primary/25"></div>
        <svg class="size-3.5 shrink-0 text-primary/60" viewBox="0 0 16 16" fill="none">
            <path
                d="M3 6l5 5 5-5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round" />
        </svg>
    </div>
{/snippet}

<section class="border-b border-neutral-200 bg-neutral-50 py-20 md:py-28">
    <Container wide>
        <Eyebrow>How agent works</Eyebrow>
        <div class="mt-3 grid gap-6 lg:items-end">
            <h2 class="text-3xl font-semibold tracking-tight text-neutral-950 md:text-4xl">
                One predictable path, shaped by the mode you pick.
            </h2>
            <p class="text-neutral-600">
                Proval reacts to a repository event and follows the same flow every time. Pick a mode to see how it
                runs.
            </p>
        </div>

        <div
            class="relative mt-12 overflow-hidden rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)] md:p-6">
            <div
                class="pointer-events-none absolute inset-x-6 top-0 h-px bg-linear-to-r from-transparent via-primary/30 to-transparent md:inset-x-6"
                aria-hidden="true">
            </div>

            <div class="relative grid gap-5 lg:h-96 lg:grid-cols-[auto_1fr] lg:items-stretch">
                <div class="flex w-full flex-col justify-center gap-2 lg:h-full lg:w-max lg:shrink-0">
                    {#each reviewModeList as mode (mode.id)}
                        {@render modeOption(mode, activeMode === mode.id)}
                    {/each}
                </div>

                <div
                    class="relative flex min-h-72 items-center justify-center rounded-xl bg-neutral-50/80 p-6 ring-1 ring-neutral-100 md:min-h-80 md:overflow-x-auto md:p-8 lg:h-full lg:min-h-0">
                    <div
                        class="pointer-events-none absolute inset-0 rounded-xl opacity-60"
                        style="background-image: radial-gradient(circle at 1px 1px, rgb(0 0 0 / 0.04) 1px, transparent 0); background-size: 20px 20px;"
                        aria-hidden="true">
                    </div>

                    {#key currentMode.id}
                        <div
                            class="relative mx-auto flex w-full max-w-sm flex-col items-stretch md:max-w-none md:min-w-max md:flex-row md:items-center md:justify-center"
                            in:fade={{ duration: 200 }}>
                            {#each currentMode.stages as stage, i (i)}
                                {#if i > 0}
                                    {@render flowEdge()}
                                {/if}

                                {@const step = i + 1}

                                {@render stageNode(stage, step)}
                            {/each}
                        </div>
                    {/key}
                </div>
            </div>
        </div>
    </Container>
</section>

<section class="border-b border-neutral-200 bg-white py-20 md:py-28">
    <Container wide>
        <div class="grid gap-10 lg:grid-cols-[0.8fr_1fr] lg:items-center">
            <div>
                <Eyebrow>Deployment</Eyebrow>
                <h2 class="mt-3 text-3xl font-semibold tracking-tight text-neutral-950 md:text-4xl">
                    Start with a small self-hosted deployment.
                </h2>
                <p class="mt-4 text-neutral-600">
                    Proval is designed around a simple Docker-first path: run the service, connect your model, link
                    repositories, and test a real merge request.
                </p>
                <ButtonLink href="/docs/quick-start" variant="primary" class="mt-6">
                    Open the Docker guide
                </ButtonLink>
            </div>

            <div class="mx-auto mt-20 w-full max-w-xl text-left">
                <div class="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-950 shadow-sm">
                    <div class="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-2.5">
                        <span class="font-mono text-xs text-neutral-500">docker-compose.yml</span>
                        <Button
                            variant="ghost"
                            class="h-auto px-2 py-1 font-mono text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
                            onclick={copyDockerCompose}>
                            {copyLabel}
                        </Button>
                    </div>
                    <pre class="overflow-x-auto p-4 font-mono text-[13px] leading-6 text-neutral-100"><code
                            >{dockerCompose}</code></pre>
                </div>
                <p class="mt-3 text-center text-sm text-neutral-500">
                    Deploy in a minute with Docker Compose.
                    <ButtonLink href="/docs/quick-start" variant="primary" class="inline">
                        Full setup guide
                    </ButtonLink>
                </p>
            </div>

            <!-- <div class="rounded-2xl border border-neutral-200 bg-neutral-950 p-5 text-sm text-neutral-100">
                <pre class="overflow-x-auto font-mono leading-7"><code
                        >docker compose up -d

# then connect
Model endpoint  -> OpenAI-compatible API
Git provider    -> GitLab / Forgejo / GitHub
Repository      -> review and reply policy</code></pre>
                <ol class="mt-6 grid gap-2 border-t border-neutral-800 pt-5 text-neutral-400">
                    {#each deploySteps as step, index (step)}
                        <li class="flex gap-3">
                            <span class="font-mono text-neutral-600">0{index + 1}</span>
                            <span>{step}</span>
                        </li>
                    {/each}
                </ol>
            </div> -->
        </div>
    </Container>
</section>

<section class="bg-white py-20 md:py-28">
    <Container>
        <Eyebrow>FAQ</Eyebrow>
        <h2 class="mt-3 text-3xl font-semibold tracking-tight text-neutral-950">A few practical answers.</h2>

        <div class="mt-10 divide-y divide-neutral-200 border-y border-neutral-200">
            {#each faqs as faq (faq.question)}
                <div class="py-6">
                    <h3 class="font-semibold tracking-tight text-neutral-950">{faq.question}</h3>
                    <p class="mt-2 text-sm leading-6 text-neutral-600">{faq.answer}</p>
                </div>
            {/each}
        </div>
    </Container>
</section>

<style>
    @keyframes integration-dash-h {
        to {
            background-position: 12px 0;
        }
    }

    @keyframes integration-dash-v-down {
        to {
            background-position: 0 12px;
        }
    }

    @keyframes integration-dash-v-up {
        to {
            background-position: 0 -12px;
        }
    }

    .integration-line-h-blue {
        height: 2px;
        min-height: 2px;
        background-image: repeating-linear-gradient(to right, rgb(14 165 233) 0 6px, transparent 6px 12px);
        background-size: 12px 2px;
        animation: integration-dash-h 0.9s linear infinite;
    }

    .integration-line-h-green {
        height: 2px;
        min-height: 2px;
        background-image: repeating-linear-gradient(to right, rgb(16 185 129) 0 6px, transparent 6px 12px);
        background-size: 12px 2px;
        animation: integration-dash-h 0.9s linear infinite reverse;
    }

    .integration-line-v-blue {
        width: 2px;
        min-width: 2px;
        background-image: repeating-linear-gradient(to bottom, rgb(14 165 233) 0 6px, transparent 6px 12px);
        background-size: 2px 12px;
        animation: integration-dash-v-down 0.9s linear infinite;
    }

    .integration-line-v-green {
        width: 2px;
        min-width: 2px;
        background-image: repeating-linear-gradient(to bottom, rgb(16 185 129) 0 6px, transparent 6px 12px);
        background-size: 2px 12px;
        animation: integration-dash-v-up 0.9s linear infinite;
    }

    .integration-line-h-violet {
        height: 2px;
        min-height: 2px;
        background-image: repeating-linear-gradient(to right, rgb(139 92 246) 0 6px, transparent 6px 12px);
        background-size: 12px 2px;
        animation: integration-dash-h 0.9s linear infinite;
    }

    .integration-line-v-violet {
        width: 2px;
        min-width: 2px;
        background-image: repeating-linear-gradient(to bottom, rgb(139 92 246) 0 6px, transparent 6px 12px);
        background-size: 2px 12px;
        animation: integration-dash-v-down 0.9s linear infinite;
    }
</style>
