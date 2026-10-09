<script lang="ts">
    import Card from "$lib/components/layout/Card.svelte";
    import Button from "$lib/components/atom/Button.svelte";
    import Badge from "$lib/components/atom/Badge.svelte";
    import InputText from "$lib/components/atom/InputText.svelte";
    import FieldTitle from "$lib/components/atom/FieldTitle.svelte";
    import Description from "$lib/components/atom/Description.svelte";
    import fetchApi from "$lib/utils";
    import { formatTimeAgo } from "$lib/utils";
    import { openAlert, openConfirm } from "$lib/store/modal";
    import { apiScopeValueList } from "@proval/types";
    import type { ApiScope, ApiTokenResponse } from "@proval/types";

    interface Props {
        tokenList: ApiTokenResponse[];
    }

    let { tokenList }: Props = $props();

    let list = $state<ApiTokenResponse[]>([]);

    // Seeded from the loader and resynced if the page reloads. Create and revoke
    // update it in place so the list does not need a round trip.
    $effect(() => {
        list = tokenList;
    });
    let isCreating = $state(false);
    let isBusy = $state(false);
    let name = $state("");
    let expiresInDay = $state("");
    let selectedScopeList = $state<ApiScope[]>([]);
    // Held only until the user dismisses it. The server never returns it again.
    let newSecret = $state<string | null>(null);
    let isCopied = $state(false);

    const canSubmit = $derived(name.trim().length > 0 && selectedScopeList.length > 0 && !isBusy);

    function toggleScope(scope: ApiScope) {
        selectedScopeList = selectedScopeList.includes(scope)
            ? selectedScopeList.filter((value) => value !== scope)
            : [...selectedScopeList, scope];
    }

    function resetForm() {
        name = "";
        expiresInDay = "";
        selectedScopeList = [];
        isCreating = false;
    }

    async function onCreate() {
        if (!canSubmit) {
            return;
        }
        isBusy = true;
        try {
            const parsedDay = Number.parseInt(expiresInDay, 10);
            const response = await fetchApi("/api-token", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    scopeList: selectedScopeList,
                    expiresInDay: Number.isFinite(parsedDay) && parsedDay > 0 ? parsedDay : null,
                }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({ error: "Failed to create token" }));
                await openAlert(body.error ?? "Failed to create token");
                return;
            }
            const created = await response.json();
            list = [...list, created.token];
            newSecret = created.secret;
            isCopied = false;
            resetForm();
        } finally {
            isBusy = false;
        }
    }

    async function onRevoke(token: ApiTokenResponse) {
        const confirmed = await openConfirm(`Revoke "${token.name}"? Anything using it stops working immediately.`, {
            title: "Revoke token",
            confirmText: "Revoke",
        });
        if (!confirmed) {
            return;
        }
        isBusy = true;
        try {
            const response = await fetchApi(`/api-token/${token.id}`, { method: "DELETE" });
            if (!response.ok) {
                const body = await response.json().catch(() => ({ error: "Failed to revoke token" }));
                await openAlert(body.error ?? "Failed to revoke token");
                return;
            }
            list = list.filter((item) => item.id !== token.id);
        } finally {
            isBusy = false;
        }
    }

    async function onCopy() {
        if (!newSecret) {
            return;
        }
        try {
            await navigator.clipboard.writeText(newSecret);
            isCopied = true;
        } catch {
            await openAlert("Could not copy. Select the token and copy it by hand.");
        }
    }

    function isExpired(token: ApiTokenResponse): boolean {
        return !!token.expiresAt && new Date(token.expiresAt).getTime() < Date.now();
    }
</script>

<Card border title="API tokens">
    <div class="space-y-6">
        <Description placement="below">
            Tokens let a script call the API without your password. Send one as
            <code class="rounded bg-muted px-1 py-0.5 text-xs">Authorization: Bearer &lt;token&gt;</code>. A token
            cannot create or revoke other tokens.
        </Description>

        {#if newSecret}
            <div class="rounded-md border border-warning bg-warning-muted p-4">
                <FieldTitle class="mb-1">Copy this token now</FieldTitle>
                <Description placement="below">It is shown once and cannot be retrieved again.</Description>
                <p class="mt-3 break-all rounded bg-background px-3 py-2 font-mono text-xs text-foreground">
                    {newSecret}
                </p>
                <div class="mt-3 flex gap-2">
                    <Button primary size="sm" onclick={onCopy}>{isCopied ? "Copied" : "Copy"}</Button>
                    <Button text size="sm" onclick={() => (newSecret = null)}>Dismiss</Button>
                </div>
            </div>
        {/if}

        {#if list.length === 0}
            <p class="text-sm text-muted-foreground">No tokens yet.</p>
        {:else}
            <ul class="divide-y divide-border">
                {#each list as token (token.id)}
                    <li class="flex items-start justify-between gap-4 py-3">
                        <div class="min-w-0">
                            <div class="flex items-center gap-2">
                                <p class="truncate text-sm font-medium text-foreground">{token.name}</p>
                                {#if isExpired(token)}
                                    <Badge variant="danger">expired</Badge>
                                {/if}
                            </div>
                            <p class="mt-1 font-mono text-xs text-muted-foreground">{token.tokenPrefix}…</p>
                            <div class="mt-2 flex flex-wrap gap-1">
                                {#each token.scopeList as scope (scope)}
                                    <Badge variant="neutral">{scope}</Badge>
                                {/each}
                            </div>
                            <p class="mt-2 text-xs text-muted-foreground">
                                {token.lastUsedAt
                                    ? `last used ${formatTimeAgo(new Date(token.lastUsedAt))}`
                                    : "never used"}
                                {#if token.expiresAt}
                                    · expires {new Date(token.expiresAt).toLocaleDateString()}
                                {/if}
                            </p>
                        </div>
                        <Button secondary size="sm" disabled={isBusy} onclick={() => onRevoke(token)}>Revoke</Button>
                    </li>
                {/each}
            </ul>
        {/if}

        {#if isCreating}
            <div class="space-y-4 border-t border-border pt-6">
                <div>
                    <FieldTitle class="mb-1 ml-1">Name</FieldTitle>
                    <InputText bind:value={name} placeholder="ci" disabled={isBusy} />
                </div>

                <div>
                    <FieldTitle class="mb-1 ml-1">Scopes</FieldTitle>
                    <Description placement="below">A request to anything outside these scopes is refused.</Description>
                    <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {#each apiScopeValueList as scope (scope)}
                            <label class="flex items-center gap-2 text-sm text-foreground">
                                <input
                                    type="checkbox"
                                    class="rounded border-border"
                                    checked={selectedScopeList.includes(scope)}
                                    disabled={isBusy}
                                    onchange={() => toggleScope(scope)} />
                                <span class="font-mono text-xs">{scope}</span>
                            </label>
                        {/each}
                    </div>
                </div>

                <div>
                    <FieldTitle class="mb-1 ml-1">Expires in days</FieldTitle>
                    <Description placement="below">Leave empty for a token that does not expire.</Description>
                    <InputText bind:value={expiresInDay} placeholder="90" disabled={isBusy} />
                </div>

                <div class="flex justify-end gap-2">
                    <Button text disabled={isBusy} onclick={resetForm}>Cancel</Button>
                    <Button primary disabled={!canSubmit} onclick={onCreate}>
                        {isBusy ? "Creating…" : "Create token"}
                    </Button>
                </div>
            </div>
        {:else}
            <div class="flex justify-end border-t border-border pt-6">
                <Button primary disabled={isBusy} onclick={() => (isCreating = true)}>New token</Button>
            </div>
        {/if}
    </div>
</Card>
