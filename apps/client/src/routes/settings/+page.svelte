<script lang="ts">
    import { goto, invalidateAll } from "$app/navigation";
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import Card from "$lib/components/layout/Card.svelte";
    import ToggleSwitch from "$lib/components/atom/ToggleSwitch.svelte";
    import FieldTitle from "$lib/components/atom/FieldTitle.svelte";
    import Description from "$lib/components/atom/Description.svelte";
    import Button from "$lib/components/atom/Button.svelte";
    import fetchApi from "$lib/utils";
    import { openAlert, openConfirm } from "$lib/store/modal";
    import type { PageProps } from "./$types";

    let { data }: PageProps = $props();

    let isAuthEnabled = $state(data.setting.isAuthEnabled);
    let isRegistrationEnabled = $state(data.setting.isRegistrationEnabled);
    let isSaving = $state(false);
    let isLoggingOut = $state(false);

    const isLoggedIn = $derived(!!data.auth.user);
    const canEditSettings = $derived(data.auth.user?.role === "admin");
    const isDirty = $derived(
        isAuthEnabled !== data.setting.isAuthEnabled ||
            isRegistrationEnabled !== data.setting.isRegistrationEnabled,
    );

    $effect(() => {
        isAuthEnabled = data.setting.isAuthEnabled;
        isRegistrationEnabled = data.setting.isRegistrationEnabled;
    });

    async function onAuthToggle() {
        if (!canEditSettings) {
            return;
        }
        const nextValue = isAuthEnabled;
        const previous = !nextValue;
        if (previous && !nextValue) {
            const confirmed = await openConfirm(
                "Turning this off lets anyone use the dashboard without signing in. Continue?",
                { title: "Disable authentication", confirmText: "OK" },
            );
            if (!confirmed) {
                isAuthEnabled = true;
                return;
            }
            isRegistrationEnabled = false;
        }
    }

    async function onSave() {
        if (!canEditSettings || !isDirty) {
            return;
        }
        const confirmed = await openConfirm("Save these authentication settings?", {
            title: "Save settings",
            confirmText: "Save",
        });
        if (!confirmed) {
            return;
        }
        isSaving = true;
        try {
            const registrationEnabled = isAuthEnabled ? isRegistrationEnabled : false;
            const response = await fetchApi("/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    isAuthEnabled,
                    isRegistrationEnabled: registrationEnabled,
                }),
            });
            if (response.status === 401) {
                await goto(`/login?next=${encodeURIComponent("/settings")}`, { invalidateAll: true });
                return;
            }
            if (response.status === 403) {
                await openAlert("You don't have permission to change these settings.");
                return;
            }
            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({ error: "Failed to update settings" }));
                await openAlert(errorBody.error ?? "Failed to update settings");
                return;
            }
            const updated = await response.json();
            isAuthEnabled = updated.isAuthEnabled;
            isRegistrationEnabled = updated.isRegistrationEnabled;
            await invalidateAll();
        } finally {
            isSaving = false;
        }
    }

    async function onLogout() {
        isLoggingOut = true;
        try {
            await fetchApi("/auth/logout", { method: "POST" });
            await goto(isAuthEnabled ? "/login" : "/", { invalidateAll: true });
        } finally {
            isLoggingOut = false;
        }
    }
</script>

<DefaultLayout title="Settings" narrow>
    <div class="space-y-6">
        <Card border title="Authentication">
            {#if !isLoggedIn}
                <div class="space-y-4">
                    <Description placement="below">
                        Sign in as an admin to change authentication settings.
                    </Description>
                    <Button primary onclick={() => goto(`/login?next=${encodeURIComponent("/settings")}`)}>
                        Sign in
                    </Button>
                </div>
            {:else}
                <div class="space-y-6">
                    <div class="flex items-start justify-between gap-4">
                        <div>
                            <FieldTitle class="ml-1 mb-1">Require authentication</FieldTitle>
                            <Description placement="below">
                                When enabled, users must sign in to use the dashboard.
                            </Description>
                        </div>
                        <ToggleSwitch
                            bind:checked={isAuthEnabled}
                            disabled={isSaving || !canEditSettings}
                            onchange={onAuthToggle} />
                    </div>

                    {#if isAuthEnabled}
                        <div class="flex items-start justify-between gap-4 border-t border-neutral-200 pt-6">
                            <div>
                                <FieldTitle class="ml-1 mb-1">Allow new user registration</FieldTitle>
                                <Description placement="below">
                                    When enabled, anyone can create an account from the register page.
                                </Description>
                            </div>
                            <ToggleSwitch
                                bind:checked={isRegistrationEnabled}
                                disabled={isSaving || !canEditSettings} />
                        </div>
                    {/if}

                    {#if canEditSettings}
                        <div class="flex justify-end border-t border-neutral-200 pt-6">
                            <Button primary disabled={!isDirty || isSaving} onclick={onSave}>
                                {isSaving ? "Saving…" : "Save"}
                            </Button>
                        </div>
                    {/if}
                </div>
            {/if}
        </Card>

        {#if data.auth.user}
            <Card border title="Session">
                <div class="flex items-center justify-between gap-4">
                    <div>
                        <p class="text-sm text-neutral-800">{data.auth.user.email}</p>
                        <p class="mt-1 text-xs text-neutral-500 capitalize">{data.auth.user.role}</p>
                    </div>
                    <Button secondary disabled={isLoggingOut} onclick={onLogout}>
                        {isLoggingOut ? "Signing out…" : "Sign out"}
                    </Button>
                </div>
            </Card>
        {/if}
    </div>
</DefaultLayout>
