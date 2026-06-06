<script lang="ts">
    import InputText from "../atom/InputText.svelte";
    import { goto } from "$app/navigation";
    import fetchApi from "$lib/utils";
    import type {
        ModelResponse,
        ProviderOption,
        ReplyThreadPolicy,
        RepositoryResponse,
        RepositorySelectItem,
    } from "@proval/types";
    import FormField from "../molecule/FormField.svelte";
    import SimpleSelectCard from "../atom/SimpleSelectCard.svelte";
    import PatchSecret from "../molecule/PatchSecret.svelte";
    import GitProviderIcon from "../atom/GitProviderIcon.svelte";
    import Card from "../layout/Card.svelte";
    import Button from "../atom/Button.svelte";
    import Modal from "../atom/Modal.svelte";
    import { openAlert, openConfirm } from "$lib/store/modal";
    import Description from "../atom/Description.svelte";
    import ToggleSwitch from "../atom/ToggleSwitch.svelte";
    import FieldTitle from "../atom/FieldTitle.svelte";

    interface CreateProps {
        mode: "create";
        selectedRepositoryId: number;
    }

    interface EditProps {
        mode: "edit";
        repository: RepositoryResponse;
    }

    interface DefaultProps {
        modelList: ModelResponse[];
        provider: ProviderOption;
        repositoryList: RepositorySelectItem[];
    }

    type Props = (CreateProps & DefaultProps) | (EditProps & DefaultProps);

    const { modelList, provider, repositoryList, ...props }: Props = $props();

    const repository = $derived(props.mode === "edit" ? props.repository : null);

    const initialGitRepositoryId =
        props.mode === "edit"
            ? props.repository.provider === "github"
                ? props.repository.githubRepositoryId
                : props.repository.gitProviderRepositoryId
            : null;

    let selectedRepositoryId = $state<string | null>(
        props.mode === "create" ? props.selectedRepositoryId.toString() : (initialGitRepositoryId?.toString() ?? null),
    );

    const selectedRepository = $derived(repositoryList.find((r) => r.id === Number(selectedRepositoryId)) ?? null);

    // Review Agent Configuration
    let description = $state<string>(props.mode === "edit" ? (props.repository.description ?? "") : "");
    let selectedModelId = $state<string>(
        props.mode === "edit" && props.repository.modelId != null ? props.repository.modelId.toString() : "",
    );
    let language = $state<string>(props.mode === "edit" ? (props.repository.language ?? "English") : "English");

    // Pull Request Configuration
    let reviewOnPullRequestOpen = $state(
        props.mode === "edit" ? props.repository.reviewOnPullRequestOpen : true,
    );
    let inlineReview = $state(props.mode === "edit" ? props.repository.inlineReview : true);
    let deepResearchOnPullRequest = $state(
        props.mode === "edit" ? props.repository.deepResearchOnPullRequest : false,
    );
    let replyToPullRequestComment = $state<ReplyThreadPolicy>(
        props.mode === "edit" ? props.repository.replyToPullRequestComment : "all",
    );

    // Issue Configuration
    let commentOnIssueOpen = $state(props.mode === "edit" ? props.repository.commentOnIssueOpen : true);
    let replyToIssueComment = $state<ReplyThreadPolicy>(
        props.mode === "edit" ? props.repository.replyToIssueComment : "all",
    );

    let webhookSecret = $state("");
    let webhookSecretModalOpen = $state(false);

    const selectClass =
        "h-10 w-full rounded-xl border border-neutral-200 bg-gray-50 px-4 text-sm outline-none disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800";

    const replyToPullRequestCommentOptionList: {
        value: ReplyThreadPolicy;
        description: string;
    }[] = [
        { value: "all", description: "Reply on all thread comments on pull requests" },
        { value: "mentioned_only", description: "Reply only when the bot is @mentioned in PR discussion threads" },
        { value: "off", description: "Do not reply to pull request comments" },
    ];

    const replyToIssueCommentOptionList: {
        value: ReplyThreadPolicy;
        description: string;
    }[] = [
        { value: "all", description: "Reply on all thread comments on issues" },
        { value: "mentioned_only", description: "Reply only when the bot is @mentioned in issue discussion threads" },
        { value: "off", description: "Do not reply to issue comments" },
    ];

    async function handleSubmit(e: Event) {
        e.preventDefault();

        if (!selectedModelId || selectedModelId === "") {
            await openAlert("Model is required");
            return;
        }
        if (!language) {
            await openAlert("Language is required");
            return;
        }

        if (!selectedRepository) {
            await openAlert("Repository is required");
            return;
        }

        if (props.mode === "edit" && initialGitRepositoryId != null) {
            if (selectedRepository?.isConnected && selectedRepository.id !== initialGitRepositoryId) {
                await openAlert("This repository is already connected to Proval");
                return;
            }
        }

        const body: Record<string, unknown> = {
            path: selectedRepository?.path,
            description: description.trim() || null,
            provider: provider.type,
            language,
            modelId: Number(selectedModelId),
            reviewOnPullRequestOpen,
            inlineReview,
            deepResearchOnPullRequest,
            replyToPullRequestComment,
            replyToIssueComment,
            commentOnIssueOpen,
        };

        if (provider.type === "gitlab" || provider.type === "forgejo") {
            body.gitProviderAccessId = provider.accessId;
            body.gitProviderRepositoryId = selectedRepository?.id;
            if (props.mode === "create") {
                if (!webhookSecret.trim()) {
                    await openAlert("Webhook secret is required");
                    return;
                }
                body.webhookSecret = webhookSecret.trim();
            }
        } else if (provider.type === "github") {
            body.githubInstallationId = provider.githubInstallationId;
            body.githubRepositoryId = selectedRepository?.id;
        }

        const confirm = await openConfirm(
            props.mode === "edit" ? "Save changes to this repository?" : "Create this repository?",
        );
        if (!confirm) return;

        const url = props.mode === "edit" ? `/repository/${repository?.id}` : "/repository";
        const method = props.mode === "edit" ? "PUT" : "POST";

        const response = await fetchApi(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const errBody = (await response.json().catch(() => ({}))) as { error?: string };
            await openAlert(errBody.error ?? `Failed to ${props.mode === "edit" ? "update" : "create"} repository`);
            return;
        }

        await openAlert(`Repository ${props.mode === "edit" ? "updated" : "created"} successfully`);
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

    const removeUnderscore = (value: string) => value.replace(/_/g, " ");
    const capitalizeFirstLetter = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
</script>

<form onsubmit={handleSubmit} class="space-y-8">
    <Card spaceY>
        <div class="flex items-start gap-2">
            <GitProviderIcon provider={provider.type} />
            <div class="min-w-0 flex-1">
                {#if provider.type === "gitlab" || provider.type === "forgejo"}
                    <FieldTitle>{provider.label}</FieldTitle>
                    <Description>{provider.baseUrl}</Description>
                {:else if provider.type === "github"}
                    <FieldTitle>{provider.label}</FieldTitle>
                {/if}
            </div>
            <div class="mt-2 flex items-center justify-between gap-2">
                <p class="truncate text-sm text-neutral-800 dark:text-neutral-200">
                    {selectedRepository?.path ?? "—"}
                </p>
            </div>
        </div>

        <FormField label="Repository" description="Select a repository from the list">
            {#snippet children({ id })}
                <select
                    {id}
                    bind:value={selectedRepositoryId}
                    disabled={repositoryList.length === 0}
                    class={selectClass}>
                    <option value="">
                        {repositoryList.length === 0 ? "No repositories available" : "Select a repository"}
                    </option>
                    {#each repositoryList as r}
                        <option value={r.id.toString()}>
                            {r.path}{r.isConnected ? " (connected)" : ""}
                        </option>
                    {/each}
                </select>
            {/snippet}
        </FormField>

        {#if provider.type === "gitlab" || provider.type === "forgejo"}
            {#if props.mode === "create"}
                <FormField
                    label="Webhook secret"
                    description="Must match the Secret Token in your GitLab or Forgejo webhook settings">
                    {#snippet children({ id })}
                        <InputText {id} password placeholder="secret" bind:value={webhookSecret} required />
                    {/snippet}
                </FormField>
            {:else if props.mode === "edit"}
                <div class="flex justify-end pt-2">
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
                    <select {id} bind:value={selectedModelId} class={selectClass}>
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

    <Card title="Pull request" spaceY>
        <div class="space-y-4">
            <div class="flex items-center justify-between gap-2">
                <FieldTitle>Review when PR opens</FieldTitle>
                <ToggleSwitch bind:checked={reviewOnPullRequestOpen} />
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
                <ToggleSwitch bind:checked={deepResearchOnPullRequest} />
            </div>
        </div>
        <div>
            <FormField
                label="Reply to comments"
                description="How the bot responds in PR discussion threads"
                linkLabelToControl={false}
                upper>
                {#snippet children({ id: _id })}
                    <div class="flex flex-col gap-2" id={_id} role="group">
                        {#each replyToPullRequestCommentOptionList as o}
                            <SimpleSelectCard
                                label={removeUnderscore(capitalizeFirstLetter(o.value))}
                                description={o.description}
                                selected={replyToPullRequestComment === o.value}
                                onclick={() => (replyToPullRequestComment = o.value)} />
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
                        {#each replyToIssueCommentOptionList as o}
                            <SimpleSelectCard
                                label={removeUnderscore(capitalizeFirstLetter(o.value))}
                                description={o.description}
                                selected={replyToIssueComment === o.value}
                                onclick={() => (replyToIssueComment = o.value)} />
                        {/each}
                    </div>
                {/snippet}
            </FormField>
        </div>
    </Card>

    <div class="-mt-2 flex justify-between">
        <div class="flex gap-4">
            <Button primary type="submit">{props.mode === "create" ? "Create" : "Save"}</Button>
        </div>
        <div class="mr-4">
            {#if props.mode === "edit"}
                <Button
                    text
                    onclick={() => {
                        if (repository) deleteRepository(repository.id);
                    }}>Remove Repository</Button>
            {:else if props.mode === "create"}
                <Button text onclick={() => goto("/repository")} type="button">Cancel</Button>
            {/if}
        </div>
    </div>
</form>

{#if props.mode === "edit" && repository && (provider.type === "gitlab" || provider.type === "forgejo")}
    <Modal bind:open={webhookSecretModalOpen}>
        <PatchSecret
            label="Update Webhook Secret"
            placeholder="secret"
            patchEndpoint={`/repository/${repository.id}/webhook-secret`}
            onSuccess={() => (webhookSecretModalOpen = false)} />
    </Modal>
{/if}
