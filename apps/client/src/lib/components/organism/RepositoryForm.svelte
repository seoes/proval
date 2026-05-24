<script lang="ts">
    import InputText from "../atom/InputText.svelte";
    import { goto } from "$app/navigation";
    import fetchApi from "$lib/utils";
    import type { ModelResponse, RepositoryResponse } from "@proval/types";
    import FormField from "../molecule/FormField.svelte";
    import ToggleButton from "../atom/ToggleButton.svelte";
    import SimpleSelectCard from "../atom/SimpleSelectCard.svelte";
    import { siForgejo, siGitea, siGithub, siGitlab } from "simple-icons";
    import Card from "../layout/Card.svelte";
    import Button from "../atom/Button.svelte";
    import { openAlert, openConfirm } from "$lib/store/modal";
    import Description from "../atom/Description.svelte";
    import ToggleSwitch from "../atom/ToggleSwitch.svelte";
    import FieldTitle from "../atom/FieldTitle.svelte";
    import Modal from "../atom/Modal.svelte";
    import PatchSecret from "../molecule/PatchSecret.svelte";

    type ReplyThreadPolicy = "all" | "mentioned_only" | "off";

    type AccessItem = {
        id: number;
        provider: "gitlab" | "forgejo";
        name: string;
        baseUrl: string;
    };

    type InitialData = Partial<RepositoryResponse> & {
        gitProviderAccessId?: number | null;
    };

    interface Props {
        mode: "create" | "edit";
        repositoryId?: number;
        provider?: RepositoryResponse["provider"];
        modelList: ModelResponse[];
        accessList?: AccessItem[];
        initialData?: InitialData;
    }

    const { mode, repositoryId, provider: initialProvider, modelList, accessList = [], initialData }: Props = $props();

    let name = $state(initialData?.name ?? "");
    let language = $state(initialData?.language ?? "English");
    let gitProviderRepositoryId = $state(initialData?.gitProviderRepositoryId?.toString() ?? "");
    let githubRepositoryPath = $state(initialData?.githubRepositoryPath ?? "");
    let modelId = $state(initialData?.modelId?.toString() ?? "");
    let provider = $state(initialData?.provider ?? initialProvider ?? "");
    let gitProviderAccessId = $state(initialData?.gitProviderAccessId?.toString() ?? "");
    let deepResearchOnMergeRequest = $state(initialData?.deepResearchOnMergeRequest ?? false);

    let reviewOnMergeRequestOpen = $state(initialData?.reviewOnMergeRequestOpen ?? true);
    let commentOnIssueOpen = $state(initialData?.commentOnIssueOpen ?? true);
    let replyToMergeRequestComment = $state<ReplyThreadPolicy>(initialData?.replyToMergeRequestComment ?? "all");
    let replyToIssueComment = $state<ReplyThreadPolicy>(initialData?.replyToIssueComment ?? "all");
    let inlineReview = $state(initialData?.inlineReview ?? true);

    // Repository list from provider
    type RepositoryListItem = {
        id: number;
        name: string;
        fullName: string;
        description: string | null;
        defaultBranch: string;
    };
    let repositoryList = $state<RepositoryListItem[]>([]);
    let isLoadingRepositoryList = $state(false);

    let webhookSecret = $state("");
    let webhookSecretModalOpen = $state(false);

    const providerOptionList = [
        { label: "GitLab", value: "gitlab" as const, icon: siGitlab },
        { label: "GitHub", value: "github" as const, icon: siGithub },
        { label: "Gitea", value: "gitea" as const, icon: siGitea },
        { label: "Forgejo", value: "forgejo" as const, icon: siForgejo },
    ].filter((item) => item.value === provider || item.value === initialData?.provider);

    const replyToMergeRequestCommentOptionList: {
        label: string;
        value: ReplyThreadPolicy;
        description: string;
    }[] = [
        {
            label: "All",
            value: "all",
            description: "Reply on all thread comments on merge requests",
        },
        {
            label: "Mentioned only",
            value: "mentioned_only",
            description: "Reply only when the bot is @mentioned in MR discussion threads",
        },
        {
            label: "Off",
            value: "off",
            description: "Do not reply to merge request comments",
        },
    ];

    const replyToIssueCommentOptionList: {
        label: string;
        value: ReplyThreadPolicy;
        description: string;
    }[] = [
        {
            label: "All",
            value: "all",
            description: "Reply on all thread comments on issues",
        },
        {
            label: "Mentioned only",
            value: "mentioned_only",
            description: "Reply only when the bot is @mentioned in issue discussion threads",
        },
        {
            label: "Off",
            value: "off",
            description: "Do not reply to issue comments",
        },
    ];

    async function handleSubmit(e: Event) {
        e.preventDefault();

        if (!name) {
            await openAlert("Name is required");
            return;
        }
        if (!modelId) {
            await openAlert("Model is required");
            return;
        }
        if (!language) {
            await openAlert("Language is required");
            return;
        }
        if (!provider) {
            await openAlert("Provider is required");
            return;
        }
        if ((provider === "gitlab" || provider === "forgejo") && !gitProviderAccessId) {
            await openAlert("Git provider access is required");
            return;
        }
        if ((provider === "gitlab" || provider === "forgejo") && !gitProviderRepositoryId) {
            await openAlert("Repository ID is required");
            return;
        }
        if (mode === "create" && (provider === "gitlab" || provider === "forgejo") && !webhookSecret.trim()) {
            await openAlert("Webhook secret is required");
            return;
        }

        if (mode === "create") {
            const confirm = await openConfirm("Create this repository?");
            if (!confirm) return;
            const body: Record<string, unknown> = {
                name,
                provider,
                gitProviderAccessId: gitProviderAccessId ? parseInt(gitProviderAccessId, 10) : null,
                language,
                gitProviderRepositoryId: gitProviderRepositoryId ? parseInt(gitProviderRepositoryId, 10) : null,
                githubRepositoryPath: githubRepositoryPath || null,
                modelId: modelId ? parseInt(modelId, 10) : null,
                reviewOnMergeRequestOpen,
                commentOnIssueOpen,
                replyToMergeRequestComment,
                replyToIssueComment,
                inlineReview,
                deepResearchOnMergeRequest,
            };
            if (provider === "gitlab" || provider === "forgejo") {
                body.webhookSecret = webhookSecret.trim();
            }

            await fetchApi("/repository", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
        } else {
            const confirm = await openConfirm("Update this repository?");
            if (!confirm) return;
            const body = {
                name,
                provider,
                gitProviderAccessId: gitProviderAccessId ? parseInt(gitProviderAccessId, 10) : null,
                language,
                gitProviderRepositoryId: gitProviderRepositoryId ? parseInt(gitProviderRepositoryId, 10) : null,
                githubRepositoryPath: githubRepositoryPath || null,
                modelId: modelId ? parseInt(modelId, 10) : null,
                reviewOnMergeRequestOpen,
                commentOnIssueOpen,
                replyToMergeRequestComment,
                replyToIssueComment,
                inlineReview,
                deepResearchOnMergeRequest,
            };

            await fetchApi(`/repository/${repositoryId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
        }

        goto("/repository");
    }

    async function removeRepository(rid: number) {
        const confirmed = await openConfirm("Are you sure you want to remove this repository?");
        if (!confirmed) return;
        await fetchApi(`/repository/${rid}`, {
            method: "DELETE",
        });
        await openAlert("Repository removed successfully");
        goto("/repository");
    }

    async function loadRepositoryList(accessId: string) {
        if (!accessId) {
            repositoryList = [];
            return;
        }
        isLoadingRepositoryList = true;
        try {
            const res = await fetchApi(`/access/${accessId}/repository`);
            if (res.ok) {
                repositoryList = await res.json();
            } else {
                repositoryList = [];
            }
        } catch {
            repositoryList = [];
        } finally {
            isLoadingRepositoryList = false;
        }
    }

    // Load repository list when access is pre-selected (edit mode)
    $effect(() => {
        if (gitProviderAccessId && (provider === "gitlab" || provider === "forgejo")) {
            loadRepositoryList(gitProviderAccessId);
        }
    });
</script>

<form onsubmit={handleSubmit} class="space-y-8">
    <Card spaceY>
        <div>
            <FormField label="Name" description="The name of the repository">
                {#snippet children({ id })}
                    <InputText {id} placeholder="My Project" bind:value={name} />
                {/snippet}
            </FormField>
        </div>

        <div>
            <FormField label="Model" description="Select the model to use for the repository">
                {#snippet children({ id })}
                    <select
                        {id}
                        bind:value={modelId}
                        class="h-10 w-full rounded-xl border border-neutral-200 bg-gray-50 px-4 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800">
                        <option value="">Select a model</option>
                        {#each modelList as model}
                            <option value={model.id.toString()}>{model.label}</option>
                        {/each}
                    </select>
                {/snippet}
            </FormField>
        </div>
        <div>
            <FormField label="Language" description="Default language for code review">
                {#snippet children({ id })}
                    <InputText {id} placeholder="English" bind:value={language} />
                {/snippet}
            </FormField>
        </div>
    </Card>
    <Card title="Git Provider" spaceY>
        <div>
            <FormField
                label="Provider"
                description="The provider of the repository (GitLab, GitHub, Gitea, or Forgejo)"
                upper
                linkLabelToControl={false}>
                {#snippet children({ id: _id })}
                    <div class="flex h-36 gap-2" id={_id} role="group">
                        {#each providerOptionList as item}
                            <ToggleButton
                                label={item.label}
                                selected={provider === item.value}
                                onclick={() => (provider = item.value)}
                                icon={item.icon} />
                        {/each}
                    </div>
                {/snippet}
            </FormField>
        </div>

        {#if provider === "gitlab" || provider === "forgejo"}
            <div>
                <FormField label="Git Provider Access" description="Select an access configuration for this repository">
                    {#snippet children({ id })}
                        <select
                            {id}
                            value={gitProviderAccessId}
                            onchange={(e) => {
                                const newValue = (e.target as HTMLSelectElement).value;
                                gitProviderAccessId = newValue;
                                gitProviderRepositoryId = "";
                                loadRepositoryList(newValue);
                            }}
                            class="h-10 w-full rounded-xl border border-neutral-200 bg-gray-50 px-4 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800">
                            <option value="">Select an access</option>
                            {#each accessList as access}
                                <option value={access.id.toString()}>
                                    {access.name} — {access.baseUrl}
                                </option>
                            {/each}
                        </select>
                    {/snippet}
                </FormField>
            </div>

            <div>
                <FormField
                    label="Repository"
                    description={isLoadingRepositoryList
                        ? "Loading repository list..."
                        : "Select a repository from the list"}>
                    {#snippet children({ id })}
                        <select
                            {id}
                            bind:value={gitProviderRepositoryId}
                            disabled={!gitProviderAccessId || repositoryList.length === 0 || isLoadingRepositoryList}
                            class="h-10 w-full rounded-xl border border-neutral-200 bg-gray-50 px-4 text-sm outline-none disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800">
                            <option value="">
                                {isLoadingRepositoryList
                                    ? "Loading..."
                                    : repositoryList.length === 0
                                      ? "Select access first"
                                      : "Select a repository"}
                            </option>
                            {#each repositoryList as repo}
                                <option value={repo.id.toString()}>
                                    {repo.fullName}
                                </option>
                            {/each}
                        </select>
                    {/snippet}
                </FormField>
            </div>
        {/if}
        {#if provider === "github"}
            <div>
                <FormField
                    label="GitHub repository path"
                    description="e.g. owner/repo (if not using the GitHub App flow only)">
                    {#snippet children({ id })}
                        <InputText {id} placeholder="acme/cool-app" bind:value={githubRepositoryPath} />
                    {/snippet}
                </FormField>
            </div>
        {/if}

        {#if mode === "create" && (provider === "gitlab" || provider === "forgejo")}
            <div>
                <FormField
                    label="Webhook secret"
                    description="Must match the Secret Token in your GitLab or Forgejo webhook settings">
                    {#snippet children({ id })}
                        <InputText {id} password placeholder="secret" bind:value={webhookSecret} required />
                    {/snippet}
                </FormField>
            </div>
        {/if}
        {#if mode === "edit" && repositoryId && (provider === "gitlab" || provider === "forgejo")}
            <div class="pt-2">
                <Button secondary onclick={() => (webhookSecretModalOpen = true)} type="button" class="w-auto">
                    Update Webhook Secret
                </Button>
            </div>
        {/if}
    </Card>
    <Card title="Merge request" spaceY>
        <div class="space-y-4">
            <div class="flex items-center justify-between gap-2">
                <FieldTitle>Review when PR opens</FieldTitle>
                <ToggleSwitch bind:checked={reviewOnMergeRequestOpen} />
            </div>
            <div class="flex items-center justify-between">
                <FieldTitle>Inline review</FieldTitle>
                <ToggleSwitch bind:checked={inlineReview} />
            </div>
            <div class="flex items-center justify-between">
                <div>
                    <FieldTitle>Deep Research</FieldTitle>
                    <Description>Sub agents will be used to analyze the code</Description>
                </div>
                <ToggleSwitch bind:checked={deepResearchOnMergeRequest} />
            </div>
        </div>
        <div>
            <FormField
                label="Reply to comments"
                description="How the bot responds in MR discussion threads"
                linkLabelToControl={false}
                upper>
                {#snippet children({ id: _id })}
                    <div class="flex flex-col gap-2" id={_id} role="group">
                        {#each replyToMergeRequestCommentOptionList as opt}
                            <SimpleSelectCard
                                label={opt.label}
                                description={opt.description}
                                selected={replyToMergeRequestComment === opt.value}
                                onclick={() => (replyToMergeRequestComment = opt.value)} />
                        {/each}
                    </div>
                {/snippet}
            </FormField>
        </div>
    </Card>
    <Card title="Issue" spaceY>
        <div class="flex items-center justify-between gap-2">
            <FieldTitle>Comment when issue opens</FieldTitle>
            <ToggleSwitch bind:checked={commentOnIssueOpen} />
        </div>
        <div>
            <FormField
                label="Reply to issue comments"
                description="How the bot responds in issue discussion threads"
                linkLabelToControl={false}
                upper>
                {#snippet children({ id: _id })}
                    <div class="flex flex-col gap-2" id={_id} role="group">
                        {#each replyToIssueCommentOptionList as opt}
                            <SimpleSelectCard
                                label={opt.label}
                                description={opt.description}
                                selected={replyToIssueComment === opt.value}
                                onclick={() => (replyToIssueComment = opt.value)} />
                        {/each}
                    </div>
                {/snippet}
            </FormField>
        </div>
    </Card>

    <div class="-mt-2 flex justify-between">
        <div class="flex gap-4">
            <Button primary type="submit">{mode === "create" ? "Create" : "Save"}</Button>
        </div>
        <div class="mr-4">
            {#if mode === "edit" && repositoryId}
                <Button
                    text
                    onclick={() => {
                        removeRepository(repositoryId);
                    }}>Remove Repository</Button>
            {:else if mode === "create"}
                <Button text onclick={() => goto("/repository")}>Cancel</Button>
            {/if}
        </div>
    </div>
</form>

{#if repositoryId && (provider === "gitlab" || provider === "forgejo")}
    <Modal bind:open={webhookSecretModalOpen}>
        <PatchSecret
            label="Update Webhook Secret"
            placeholder="secret"
            patchEndpoint={`/repository/${repositoryId}/webhook-secret`}
            onSuccess={() => (webhookSecretModalOpen = false)} />
    </Modal>
{/if}

<style>
    * {
        font-family: "Wanted Sans Variable", sans-serif;
    }
</style>
