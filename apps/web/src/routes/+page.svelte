<script lang="ts">
    import Container from "../lib/components/Container.svelte";
    import Eyebrow from "../lib/components/Eyebrow.svelte";
    import { BENEFITS, GITHUB_URL, SITE_DESCRIPTION } from "../lib/constants";

    const problemCards = [
        {
            title: "Reviews should not depend on one person opening an IDE",
            body: "Proval runs from repository events, so the team gets a consistent review layer even when individual workflows differ.",
        },
        {
            title: "Sensitive context needs a smaller path",
            body: "Keep diffs, tokens, prompts, and review policy inside infrastructure you control.",
        },
        {
            title: "GitHub is not the only place teams ship code",
            body: "Proval is built with GitLab, Forgejo, and GitHub in mind from the start.",
        },
    ] as const;

    const loopSteps = [
        {
            step: "01",
            title: "Repository event",
            body: "A merge request, pull request, issue, or note event reaches Proval through a webhook.",
        },
        {
            step: "02",
            title: "Context loading",
            body: "Proval reads the diff, existing comments, repository policy, and only the extra files it needs.",
        },
        {
            step: "03",
            title: "Model reasoning",
            body: "Your configured model reviews the change with the same rules every time.",
        },
        {
            step: "04",
            title: "Host feedback",
            body: "Findings, summaries, inline comments, or replies are posted back to the Git host.",
        },
    ] as const;

    const workflows = [
        {
            name: "PR / MR review",
            trigger: "Open or update a merge request",
            output: "Summary, findings, optional inline comments",
        },
        {
            name: "Thread replies",
            trigger: "A note arrives and matches reply policy",
            output: "A concise answer in the existing discussion",
        },
        {
            name: "Issue assistance",
            trigger: "A new issue or issue note is received",
            output: "Context-aware guidance for maintainers",
        },
    ] as const;

    const deploySteps = [
        "Run the container on your server",
        "Connect a model endpoint",
        "Link a Git provider and repository",
        "Point webhooks at Proval",
    ] as const;

    const faqs = [
        {
            question: "Is Proval a replacement for Cursor, Copilot, or Claude?",
            answer: "No. Those tools help individual developers. Proval is a team-level review layer that runs from repository events.",
        },
        {
            question: "Does code leave our infrastructure?",
            answer: "Proval sends review context only to the model endpoint you configure. That can be an external API, internal gateway, or local model server.",
        },
        {
            question: "Which Git hosts are supported?",
            answer: "The project is built for GitLab, Forgejo, and GitHub workflows, with webhook-driven review and reply behavior.",
        },
        {
            question: "Is it production-ready?",
            answer: "Proval is under active development. The goal is a small, reliable core loop before adding broader platform and enterprise features.",
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
        <Eyebrow>Your Code, Your Model, Your Server</Eyebrow>
        <h1
            class="mx-auto mt-5 max-w-4xl text-4xl leading-tight font-semibold tracking-[-0.045em] text-neutral-950 md:text-6xl">
            Self-hosted AI Code Review agent on your infrastructure
        </h1>
        <p class="mx-auto mt-6 max-w-2xl text-lg leading-8 text-neutral-600">
            Connect GitLab, Forgejo, or GitHub to the model you run. Proval reviews merge requests and comments from
            repository events.
        </p>

        <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
                href="/docs/getting-started"
                class="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
                Read the docs
            </a>
            <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex h-11 items-center rounded-lg border border-neutral-300 bg-white px-5 text-sm font-semibold text-neutral-800 transition-colors hover:border-neutral-400 hover:bg-neutral-50">
                View on GitHub
            </a>
        </div>

        <div class="mx-auto mt-10 w-full max-w-xl text-left">
            <div class="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-950 shadow-sm">
                <div class="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-2.5">
                    <span class="font-mono text-xs text-neutral-500">docker-compose.yml</span>
                    <button
                        type="button"
                        onclick={copyDockerCompose}
                        class="rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1 font-mono text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800 hover:text-white">
                        {copyLabel}
                    </button>
                </div>
                <pre class="overflow-x-auto p-4 font-mono text-[13px] leading-6 text-neutral-100"><code
                        >{dockerCompose}</code></pre>
            </div>
            <p class="mt-3 text-center text-sm text-neutral-500">
                Deploy in a minute with Docker Compose.
                <a
                    href="/docs/docker-compose"
                    class="font-medium text-primary underline underline-offset-2 hover:text-primary/80">
                    Full setup guide
                </a>
            </p>
        </div>

        <div
            class="mx-auto mt-14 max-w-5xl overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 p-2 text-left shadow-2xl shadow-neutral-900/10">
            <div class="rounded-xl border border-neutral-200 bg-white">
                <div class="flex h-11 items-center gap-2 border-b border-neutral-200 px-4">
                    <span class="size-2.5 rounded-full bg-red-300"></span>
                    <span class="size-2.5 rounded-full bg-amber-300"></span>
                    <span class="size-2.5 rounded-full bg-emerald-300"></span>
                    <span class="ml-3 text-xs font-medium text-neutral-500">proval.local/review</span>
                </div>

                <div class="grid gap-0 md:grid-cols-[220px_1fr]">
                    <aside class="hidden border-r border-neutral-200 bg-neutral-50 p-5 md:block">
                        <p class="text-sm font-semibold text-neutral-950">Proval</p>
                        <nav class="mt-6 space-y-2 text-sm">
                            <span class="block rounded-lg bg-white px-3 py-2 font-medium text-neutral-900 shadow-sm">
                                Activity
                            </span>
                            <span class="block px-3 py-2 text-neutral-500">Repositories</span>
                            <span class="block px-3 py-2 text-neutral-500">Models</span>
                            <span class="block px-3 py-2 text-neutral-500">Git providers</span>
                        </nav>
                    </aside>

                    <div class="p-5 md:p-8">
                        <div class="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <p class="text-xs font-medium tracking-widest text-neutral-400 uppercase">Review run</p>
                                <h2 class="mt-2 text-xl font-semibold tracking-tight text-neutral-950">
                                    acme/api-server · MR !42
                                </h2>
                                <p class="mt-1 text-sm text-neutral-500">Triggered by merge request update · GitLab</p>
                            </div>
                            <span class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                                Review posted
                            </span>
                        </div>

                        <div class="mt-7 grid gap-3 sm:grid-cols-3">
                            <div class="rounded-xl border border-neutral-200 bg-white p-4">
                                <p class="text-xs text-neutral-500">Findings</p>
                                <p class="mt-2 text-2xl font-semibold text-neutral-950">3</p>
                            </div>
                            <div class="rounded-xl border border-neutral-200 bg-white p-4">
                                <p class="text-xs text-neutral-500">Inline comments</p>
                                <p class="mt-2 text-2xl font-semibold text-neutral-950">2</p>
                            </div>
                            <div class="rounded-xl border border-neutral-200 bg-white p-4">
                                <p class="text-xs text-neutral-500">Model</p>
                                <p class="mt-2 truncate text-sm font-semibold text-neutral-950">local-qwen</p>
                            </div>
                        </div>

                        <div class="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                            <p class="text-sm font-medium text-neutral-950">Top-level review</p>
                            <p class="mt-2 text-sm leading-6 text-neutral-600">
                                The change is small, but the new webhook path needs one validation check before merge.
                                See inline comments for exact lines.
                            </p>
                        </div>

                        <div class="mt-4 grid gap-3 lg:grid-cols-2">
                            <div class="rounded-xl border border-amber-200 bg-amber-50 p-4">
                                <p class="text-xs font-semibold text-amber-700">Warning</p>
                                <p class="mt-2 text-sm text-amber-900">
                                    Missing signature check before processing the event body.
                                </p>
                            </div>
                            <div class="rounded-xl border border-neutral-200 bg-white p-4">
                                <p class="text-xs font-semibold text-neutral-500">Reply mode</p>
                                <p class="mt-2 text-sm text-neutral-700">mention_only · self-reply skipped</p>
                            </div>
                        </div>
                    </div>
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
                <a
                    href="/docs/docker-compose"
                    class="mt-6 inline-flex text-sm font-semibold text-primary underline underline-offset-4">
                    Open the Docker guide
                </a>
            </div>

            <div class="rounded-2xl border border-neutral-200 bg-neutral-950 p-5 text-sm text-neutral-100">
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
            </div>
        </div>
    </Container>
</section>

<section class="border-b border-neutral-200 bg-neutral-50 py-20 md:py-28">
    <Container wide>
        <div class="grid gap-10 lg:grid-cols-[0.85fr_1fr] lg:items-start">
            <div>
                <Eyebrow>Why it exists</Eyebrow>
                <h2 class="mt-3 text-3xl font-semibold tracking-tight text-neutral-950 md:text-4xl">
                    AI review is more useful when it is a team system.
                </h2>
                <p class="mt-4 text-neutral-600">
                    IDE agents are useful, but they depend on individual habits. Proval sits next to the repository and
                    runs the same review policy whenever events arrive.
                </p>
            </div>

            <div class="grid gap-3">
                {#each problemCards as card (card.title)}
                    <div class="rounded-2xl border border-neutral-200 bg-white p-5">
                        <h3 class="font-semibold tracking-tight text-neutral-950">{card.title}</h3>
                        <p class="mt-2 text-sm leading-6 text-neutral-600">{card.body}</p>
                    </div>
                {/each}
            </div>
        </div>
    </Container>
</section>

<section class="border-b border-neutral-200 bg-white py-20 md:py-28">
    <Container wide>
        <div class="max-w-2xl">
            <Eyebrow>What you get</Eyebrow>
            <h2 class="mt-3 text-3xl font-semibold tracking-tight text-neutral-950 md:text-4xl">
                Control without turning review automation into another platform project.
            </h2>
        </div>

        <div class="mt-10 grid gap-4 md:grid-cols-2">
            {#each BENEFITS as benefit (benefit.title)}
                <div class="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-900/3">
                    <h3 class="font-semibold tracking-tight text-neutral-950">{benefit.title}</h3>
                    <p class="mt-3 text-sm leading-6 text-neutral-600">{benefit.body}</p>
                </div>
            {/each}
        </div>
    </Container>
</section>

<section class="border-b border-neutral-800 bg-neutral-950 py-20 text-white md:py-28">
    <Container wide>
        <Eyebrow class="text-neutral-500">Core agent loop</Eyebrow>
        <div class="mt-3 grid gap-6 lg:grid-cols-[0.8fr_1fr] lg:items-end">
            <h2 class="text-3xl font-semibold tracking-tight md:text-4xl">
                From webhook to review comment in one predictable path.
            </h2>
            <p class="text-neutral-400">
                The loop is intentionally small. Proval receives an event, gathers enough context, asks the configured
                model, and writes the result back to the Git host.
            </p>
        </div>

        <ol class="mt-12 grid gap-3 md:grid-cols-4">
            {#each loopSteps as item (item.step)}
                <li class="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
                    <p class="font-mono text-xs text-neutral-500">{item.step}</p>
                    <h3 class="mt-5 font-semibold text-white">{item.title}</h3>
                    <p class="mt-3 text-sm leading-6 text-neutral-400">{item.body}</p>
                </li>
            {/each}
        </ol>
    </Container>
</section>

<section class="border-b border-neutral-200 bg-neutral-50 py-20 md:py-28">
    <Container wide>
        <div class="max-w-2xl">
            <Eyebrow>Workflows</Eyebrow>
            <h2 class="mt-3 text-3xl font-semibold tracking-tight text-neutral-950 md:text-4xl">
                What Proval does after it receives an event.
            </h2>
            <p class="mt-4 text-neutral-600">
                Each workflow is built around the same idea: clear trigger, narrow context, one useful action back in
                the Git host.
            </p>
        </div>

        <div class="mt-10 grid gap-4 lg:grid-cols-3">
            {#each workflows as workflow (workflow.name)}
                <article class="rounded-2xl border border-neutral-200 bg-white p-6">
                    <h3 class="font-semibold tracking-tight text-neutral-950">{workflow.name}</h3>
                    <dl class="mt-5 space-y-4 text-sm">
                        <div>
                            <dt class="font-medium text-neutral-400">Trigger</dt>
                            <dd class="mt-1 text-neutral-700">{workflow.trigger}</dd>
                        </div>
                        <div>
                            <dt class="font-medium text-neutral-400">Output</dt>
                            <dd class="mt-1 text-neutral-700">{workflow.output}</dd>
                        </div>
                    </dl>
                </article>
            {/each}
        </div>
    </Container>
</section>

<section class="border-b border-neutral-200 bg-neutral-50 py-20 md:py-28">
    <Container wide>
        <div class="grid gap-4 md:grid-cols-2">
            <a
                href="/docs"
                class="rounded-2xl border border-neutral-200 bg-white p-6 transition-colors hover:border-neutral-300">
                <Eyebrow>Docs</Eyebrow>
                <h2 class="mt-3 text-2xl font-semibold tracking-tight text-neutral-950">
                    Install, connect, and run your first review.
                </h2>
                <p class="mt-3 text-sm leading-6 text-neutral-600">
                    Start with the setup guide, then move to Docker deployment when you are ready to try a persistent
                    instance.
                </p>
            </a>

            <a
                href="/blog"
                class="rounded-2xl border border-neutral-200 bg-white p-6 transition-colors hover:border-neutral-300">
                <Eyebrow>Blog</Eyebrow>
                <h2 class="mt-3 text-2xl font-semibold tracking-tight text-neutral-950">
                    Notes on self-hosted review automation.
                </h2>
                <p class="mt-3 text-sm leading-6 text-neutral-600">
                    Short project updates and product notes about privacy-first code review infrastructure.
                </p>
            </a>
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
