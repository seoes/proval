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
    let isRerunInterruptedActivity = $state(data.setting.isRerunInterruptedActivity);
    let isWaitForRunningActivityOnShutdown = $state(data.setting.isWaitForRunningActivityOnShutdown);
    let isSaving = $state(false);
    let isLoggingOut = $state(false);

    const isLoggedIn = $derived(!!data.auth.user);
    const canEditSettings = $derived(data.auth.user?.role === "admin");
    const isDirty = $derived(
        isAuthEnabled !== data.setting.isAuthEnabled ||
            isRegistrationEnabled !== data.setting.isRegistrationEnabled ||
            isRerunInterruptedActivity !== data.setting.isRerunInterruptedActivity ||
            isWaitForRunningActivityOnShutdown !== data.setting.isWaitForRunningActivityOnShutdown,
    );

    $effect(() => {
        isAuthEnabled = data.setting.isAuthEnabled;
        isRegistrationEnabled = data.setting.isRegistrationEnabled;
        isRerunInterruptedActivity = data.setting.isRerunInterruptedActivity;
        isWaitForRunningActivityOnShutdown = data.setting.isWaitForRunningActivityOnShutdown;
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

    async function putSettings(body: Record<string, boolean>) {
        const response = await fetchApi("/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (response.status === 401) {
            await goto(`/login?next=${encodeURIComponent("/settings")}`, { invalidateAll: true });
            return null;
        }
        if (response.status === 403) {
            await openAlert("You don't have permission to change these settings.");
            return null;
        }
        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({ error: "Failed to update settings" }));
            await openAlert(errorBody.error ?? "Failed to update settings");
            return null;
        }
        return await response.json();
    }

    async function onSave() {
        if (!canEditSettings || !isDirty) {
            return;
        }
        const confirmed = await openConfirm("Save these settings?", {
            title: "Save settings",
            confirmText: "Save",
        });
        if (!confirmed) {
            return;
        }
        isSaving = true;
        try {
            const registrationEnabled = isAuthEnabled ? isRegistrationEnabled : false;
            const updated = await putSettings({
                isAuthEnabled,
                isRegistrationEnabled: registrationEnabled,
                isRerunInterruptedActivity,
                isWaitForRunningActivityOnShutdown,
            });
            if (!updated) return;
            isAuthEnabled = updated.isAuthEnabled;
            isRegistrationEnabled = updated.isRegistrationEnabled;
            isRerunInterruptedActivity = updated.isRerunInterruptedActivity;
            isWaitForRunningActivityOnShutdown = updated.isWaitForRunningActivityOnShutdown;
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
                    <Description placement="below">Sign in as an admin to change authentication settings.</Description>
                    <Button primary onclick={() => goto(`/login?next=${encodeURIComponent("/settings")}`)}>
                        Sign in
                    </Button>
                </div>
            {:else}
                <div class="space-y-6">
                    <div class="flex items-start justify-between gap-4">
                        <div>
                            <FieldTitle class="mb-1 ml-1">Require authentication</FieldTitle>
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
                        <div class="flex items-start justify-between gap-4 border-t border-border pt-6">
                            <div>
                                <FieldTitle class="mb-1 ml-1">Allow new user registration</FieldTitle>
                                <Description placement="below">
                                    When enabled, anyone can create an account from the register page.
                                </Description>
                            </div>
                            <ToggleSwitch
                                bind:checked={isRegistrationEnabled}
                                disabled={isSaving || !canEditSettings} />
                        </div>
                    {/if}
                </div>
            {/if}
        </Card>

        {#if isLoggedIn}
            <Card border title="Activities">
                <div class="space-y-6">
                    <div class="flex items-start justify-between gap-4 border-b border-border pb-6">
                        <div>
                            <FieldTitle class="mb-1 ml-1">Wait for running activities on shutdown</FieldTitle>
                            <Description placement="below">
                                You need to set container's timeout by setting
                                <code class="rounded-md bg-gray-200 px-1 py-0.5 text-xs dark:bg-gray-700"
                                    >stop_grace_period: 15m</code
                                >(or any value) on Docker container first.
                            </Description>
                        </div>
                        <ToggleSwitch
                            bind:checked={isWaitForRunningActivityOnShutdown}
                            disabled={isSaving || !canEditSettings} />
                    </div>

                    <div class="flex items-start justify-between gap-4">
                        <div>
                            <FieldTitle class="mb-1 ml-1">Rerun interrupted activities on restart</FieldTitle>
                            <Description placement="below">
                                Activities interrupted by server's shutdown will be queued again on restart
                            </Description>
                        </div>
                        <ToggleSwitch
                            bind:checked={isRerunInterruptedActivity}
                            disabled={isSaving || !canEditSettings} />
                    </div>
                </div>
            </Card>
        {/if}

        {#if data.auth.user}
            <Card border title="Session">
                <div class="flex items-center justify-between gap-4">
                    <div>
                        <p class="text-sm text-foreground">{data.auth.user.email}</p>
                        <p class="mt-1 text-xs text-muted-foreground capitalize">{data.auth.user.role}</p>
                    </div>
                    <Button secondary disabled={isLoggingOut} onclick={onLogout}>
                        {isLoggingOut ? "Signing out…" : "Sign out"}
                    </Button>
                </div>
            </Card>
        {/if}

        <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">{__PROVAL_VERSION__}</span>
            {#if canEditSettings && isLoggedIn}
                <Button primary disabled={!isDirty || isSaving} onclick={onSave}>
                    {isSaving ? "Saving…" : "Save"}
                </Button>
            {/if}
        </div>
    </div>
</DefaultLayout>
