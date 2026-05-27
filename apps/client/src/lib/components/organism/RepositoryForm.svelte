<script lang="ts">
    import InputText from "../atom/InputText.svelte";
    import { goto } from "$app/navigation";
    import fetchApi from "$lib/utils";
    import type {
        AccessResponse,
        GitHubInstallationResponse,
        ModelResponse,
        ReplyThreadPolicy,
        RepositoryResponse,
    } from "@proval/types";
    import FormField from "../molecule/FormField.svelte";
    import SimpleSelectCard from "../atom/SimpleSelectCard.svelte";
    import PatchSecret from "../molecule/PatchSecret.svelte";
    import GitProviderIcon from "../atom/GitProviderIcon.svelte";
    import Card from "../layout/Card.svelte";
    import Button from "../atom/Button.svelte";
    import Modal from "../atom/Modal.svelte";
    import { openAlert, openConfirm } from "$lib/store/modal";
    import type { RepositorySelectItem } from "@proval/types";
    import { loadRepositoryList } from "$lib/utils/repository-list";
    import Description from "../atom/Description.svelte";
    import ToggleSwitch from "../atom/ToggleSwitch.svelte";
    import FieldTitle from "../atom/FieldTitle.svelte";

    type RepositoryFormInitialData = Partial<
        Pick<
            RepositoryResponse,
            | "path"
            | "description"
            | "gitProviderAccessId"
            | "gitProviderRepositoryId"
            | "githubInstallationId"
            | "githubRepositoryId"
            | "language"
            | "modelId"
            | "reviewOnMergeRequestOpen"
            | "inlineReview"
            | "replyToMergeRequestComment"
            | "replyToIssueComment"
            | "commentOnIssueOpen"
            | "deepResearchOnMergeRequest"
        >
    >;

    interface Props {
        mode: "create" | "edit";
        repositoryId?: number;
        provider: RepositoryResponse["provider"];
        modelList: ModelResponse[];
        accessList?: AccessResponse[];
        installationList?: GitHubInstallationResponse[];
        githubAppId?: number | null;
        initialData?: RepositoryFormInitialData;
    }

    const {
        mode,
        repositoryId,
        provider,
        modelList,
        accessList = [],
        installationList = [],
        githubAppId = null,
        initialData,
    }: Props = $props();

    let path = $state(initialData?.path ?? "");
    let description = $state(initialData?.description ?? "");
    let isRefreshingPath = $state(false);
    let language = $state(initialData?.language ?? "English");
    const githubInstallationId = $state(initialData?.githubInstallationId?.toString() ?? "");
    let modelId = $state(initialData?.modelId?.toString() ?? "");
    const gitProviderAccessId = $state(initialData?.gitProviderAccessId?.toString() ?? "");
    let gitProviderRepositoryId = $state(
        (provider === "github"
            ? initialData?.githubRepositoryId
            : initialData?.gitProviderRepositoryId
        )?.toString() ?? "",
    );
    let deepResearchOnMergeRequest = $state(initialData?.deepResearchOnMergeRequest ?? false);

    let reviewOnMergeRequestOpen = $state(initialData?.reviewOnMergeRequestOpen ?? true);
    let commentOnIssueOpen = $state(initialData?.commentOnIssueOpen ?? true);
    let replyToMergeRequestComment = $state<ReplyThreadPolicy>(initialData?.replyToMergeRequestComment ?? "all");
    let replyToIssueComment = $state<ReplyThreadPolicy>(initialData?.replyToIssueComment ?? "all");
    let inlineReview = $state(initialData?.inlineReview ?? true);

    let webhookSecret = $state("");
    let webhookSecretModalOpen = $state(false);
    let repositoryList = $state<RepositorySelectItem[]>([]);
    let isLoadingRepositoryList = $state(false);

    const gitProviderAccess = $derived(accessList.find((a) => a.id.toString() === gitProviderAccessId));
    const githubInstallation = $derived(installationList.find((installation) => installation.id.toString() === githubInstallationId),
    );

    const selectedRepository = $derived(
        gitProviderRepositoryId
            ? (repositoryList.find((r) => r.id.toString() === gitProviderRepositoryId) ?? null)
            : null,
    );

    const selectClass =
        "h-10 w-full rounded-xl border border-neutral-200 bg-gray-50 px-4 text-sm outline-none disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800";

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

    async function reloadRepositoryList() {
        isLoadingRepositoryList = true;
        try {
            if (provider === "github" && githubAppId && githubInstallationId) {
                repositoryList = await loadRepositoryList({
                    provider: "github",
                    appId: githubAppId,
                    installationId: parseInt(githubInstallationId, 10),
                });
            } else if (
                gitProviderAccessId &&
                (provider === "gitlab" || provider === "forgejo")
            ) {
                repositoryList = await loadRepositoryList({
                    provider,
                    accessId: parseInt(gitProviderAccessId, 10),
                });
            } else {
                repositoryList = [];
            }
        } finally {
            isLoadingRepositoryList = false;
        }
    }

    $effect(() => {
        if (mode === "edit") {
            reloadRepositoryList();
        }
    });

    $effect(() => {
        const fullName = selectedRepository?.fullName;
        if (fullName) {
            path = fullName;
        }
    });

    async function refreshPath() {
        if (!repositoryId) {
            return;
        }
        isRefreshingPath = true;
        try {
            const res = await fetchApi(`/repository/${repositoryId}/refresh-path`, { method: "POST" });
            if (!res.ok) {
                const errBody = (await res.json().catch(() => ({}))) as { error?: string };
                await openAlert(errBody.error ?? "Failed to refresh repository path");
                return;
            }
            const data = (await res.json()) as { path: string };
            path = data.path;
        } catch {
            await openAlert("Failed to refresh repository path");
        } finally {
            isRefreshingPath = false;
        }
    }

    async function handleSubmit(e: Event) {
        e.preventDefault();

        if (!modelId) {
            await openAlert("Model is required");
            return;
        }
        if (!language) {
            await openAlert("Language is required");
            return;
        }
        if ((provider === "gitlab" || provider === "forgejo") && !gitProviderAccessId) {
            await openAlert("Git provider access is required");
            return;
        }
        if (mode === "create") {
            if (
                (provider === "gitlab" || provider === "forgejo") &&
                initialData?.gitProviderRepositoryId === null
            ) {
                await openAlert("Repository is required");
                return;
            }
            if (provider === "github" && initialData?.githubRepositoryId === null) {
                await openAlert("Repository is required");
                return;
            }
        } else if (!gitProviderRepositoryId) {
            await openAlert("Repository is required");
            return;
        }
        if (provider === "github" && !githubInstallationId) {
            await openAlert("GitHub installation is required");
            return;
        }
        if (mode === "edit") {
            const currentRepoId =
                provider === "github"
                    ? initialData?.githubRepositoryId
                    : initialData?.gitProviderRepositoryId;
            if (selectedRepository?.alreadyConnected && selectedRepository.id !== currentRepoId) {
                await openAlert("This repository is already connected to Proval");
                return;
            }
        }
        if (mode === "create" && (provider === "gitlab" || provider === "forgejo") && !webhookSecret.trim()) {
            await openAlert("Webhook secret is required");
            return;
        }

        const repoId =
            mode === "create"
                ? provider === "github"
                    ? (initialData?.githubRepositoryId ?? null)
                    : (initialData?.gitProviderRepositoryId ?? null)
                : gitProviderRepositoryId
                  ? parseInt(gitProviderRepositoryId, 10)
                  : null;

        const submitPath = path.trim() || null;
        if (!submitPath) {
            await openAlert("Repository path is required");
            return;
        }

        if (mode === "create") {
            const confirm = await openConfirm("Create this repository?");
            if (!confirm) return;
            const body: Record<string, unknown> = {
                path: submitPath,
                description: description.trim() || null,
                provider,
                gitProviderAccessId: gitProviderAccessId ? parseInt(gitProviderAccessId, 10) : null,
                language,
                gitProviderRepositoryId: provider === "github" ? null : repoId,
                githubInstallationId: githubInstallationId ? parseInt(githubInstallationId, 10) : null,
                githubRepositoryId: provider === "github" ? repoId : null,
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

            const res = await fetchApi("/repository", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const errBody = (await res.json().catch(() => ({}))) as { error?: string };
                await openAlert(errBody.error ?? "Failed to create repository");
                return;
            }
        } else {
            const confirm = await openConfirm("Update this repository?");
            if (!confirm) return;
            const body = {
                path: submitPath,
                description: description.trim() || null,
                provider,
                gitProviderAccessId: gitProviderAccessId ? parseInt(gitProviderAccessId, 10) : null,
                language,
                gitProviderRepositoryId: provider === "github" ? null : repoId,
                githubInstallationId: githubInstallationId ? parseInt(githubInstallationId, 10) : null,
                githubRepositoryId: provider === "github" ? repoId : null,
                modelId: modelId ? parseInt(modelId, 10) : null,
                reviewOnMergeRequestOpen,
                commentOnIssueOpen,
                replyToMergeRequestComment,
                replyToIssueComment,
                inlineReview,
                deepResearchOnMergeRequest,
            };

            const res = await fetchApi(`/repository/${repositoryId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const errBody = (await res.json().catch(() => ({}))) as { error?: string };
                await openAlert(errBody.error ?? "Failed to update repository");
                return;
            }
        }

        goto("/repository");
    }

    async function deleteRepository(rid: number) {
        const confirmed = await openConfirm("Are you sure you want to remove this repository?");
        if (!confirmed) return;
        await fetchApi(`/repository/${rid}`, {
            method: "DELETE",
        });
        await openAlert("Repository removed successfully");
        goto("/repository");
    }
</script>

<form onsubmit={handleSubmit} class="space-y-8">
    <Card spaceY>
        <div class="flex items-start gap-2">
            <GitProviderIcon {provider} />
            <div class="min-w-0 flex-1">
                {#if provider === "gitlab" || provider === "forgejo"}
                    <FieldTitle>{gitProviderAccess?.name}</FieldTitle>
                    <Description>{gitProviderAccess?.baseUrl}</Description>
                {:else if provider === "github"}
                    <FieldTitle>{githubInstallation?.accountName}</FieldTitle>
                    <Description>{githubInstallation?.accountType}</Description>
                {/if}
                <div class="flex justify-between items-center gap-2 mt-2">

                    <p class="truncate text-sm text-neutral-800 dark:text-neutral-200">
                        {path || "—"}
                    </p>
                    {#if mode === "edit" && repositoryId}
                    <Button
                        text
                        type="button"
                        class="w-auto text-xs"
                        disabled={isRefreshingPath}
                        onclick={refreshPath}>
                        {isRefreshingPath ? "Refreshing…" : "Refresh path"}
                    </Button>
                    {/if}
                </div>
            </div>
        </div>

        {#if mode === "edit"}
            <FormField
                label="Repository"
                description={isLoadingRepositoryList
                    ? "Loading repository list..."
                    : "Select a repository from the list"}>
                {#snippet children({ id })}
                    <select
                        {id}
                        bind:value={gitProviderRepositoryId}
                        disabled={repositoryList.length === 0 || isLoadingRepositoryList}
                        class={selectClass}>
                        <option value="">
                            {isLoadingRepositoryList
                                ? "Loading..."
                                : repositoryList.length === 0
                                  ? "No repositories available"
                                  : "Select a repository"}
                        </option>
                        {#each repositoryList as repo}
                            <option value={repo.id.toString()}>
                                {repo.fullName}{repo.alreadyConnected ? " (connected)" : ""}
                            </option>
                        {/each}
                    </select>
                {/snippet}
            </FormField>
        {/if}

        {#if provider === "gitlab" || provider === "forgejo"}
            {#if mode === "create"}
                <FormField
                    label="Webhook secret"
                    description="Must match the Secret Token in your GitLab or Forgejo webhook settings">
                    {#snippet children({ id })}
                        <InputText {id} password placeholder="secret" bind:value={webhookSecret} required />
                    {/snippet}
                </FormField>
            {:else if repositoryId}
                <div class="pt-2 flex justify-end">
                    <Button text onclick={() => (webhookSecretModalOpen = true)} type="button" class="w-auto text-xs">
                        Update Webhook Secret
                    </Button>
                </div>
            {/if}
        {/if}
    </Card>
    <Card title="Review Agent" spaceY>
        <FormField label="Description" description="Optional note for your team (not shown on the Git host)">
            {#snippet children({ id })}
                <InputText {id} placeholder="e.g. Backend API" bind:value={description} />
            {/snippet}
        </FormField>
        <div>
            <FormField label="Model" description="Select the model to use for the repository">
                {#snippet children({ id })}
                    <select {id} bind:value={modelId} class={selectClass}>
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
                        deleteRepository(repositoryId);
                    }}>Remove Repository</Button>
            {:else if mode === "create"}
                <Button text onclick={() => goto("/repository")} type="button">Cancel</Button>
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
