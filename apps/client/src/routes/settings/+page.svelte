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
    let isSavingAuth = $state(false);
    let isSavingActivity = $state(false);
    let isLoggingOut = $state(false);

    const isLoggedIn = $derived(!!data.auth.user);
    const canEditSettings = $derived(data.auth.user?.role === "admin");
    const isAuthDirty = $derived(
        isAuthEnabled !== data.setting.isAuthEnabled || isRegistrationEnabled !== data.setting.isRegistrationEnabled,
    );
    const isActivityDirty = $derived(
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

    async function onSaveAuth() {
        if (!canEditSettings || !isAuthDirty) {
            return;
        }
        const confirmed = await openConfirm("Save these authentication settings?", {
            title: "Save settings",
            confirmText: "Save",
        });
        if (!confirmed) {
            return;
        }
        isSavingAuth = true;
        try {
            const registrationEnabled = isAuthEnabled ? isRegistrationEnabled : false;
            const updated = await putSettings({
                isAuthEnabled,
                isRegistrationEnabled: registrationEnabled,
                isRerunInterruptedActivity: data.setting.isRerunInterruptedActivity,
                isWaitForRunningActivityOnShutdown: data.setting.isWaitForRunningActivityOnShutdown,
            });
            if (!updated) return;
            isAuthEnabled = updated.isAuthEnabled;
            isRegistrationEnabled = updated.isRegistrationEnabled;
            await invalidateAll();
        } finally {
            isSavingAuth = false;
        }
    }

    async function onSaveActivity() {
        if (!canEditSettings || !isActivityDirty) {
            return;
        }
        const confirmed = await openConfirm("Save these activity settings?", {
            title: "Save settings",
            confirmText: "Save",
        });
        if (!confirmed) {
            return;
        }
        isSavingActivity = true;
        try {
            const updated = await putSettings({
                isAuthEnabled: data.setting.isAuthEnabled,
                isRegistrationEnabled: data.setting.isRegistrationEnabled,
                isRerunInterruptedActivity,
                isWaitForRunningActivityOnShutdown,
            });
            if (!updated) return;
            isRerunInterruptedActivity = updated.isRerunInterruptedActivity;
            isWaitForRunningActivityOnShutdown = updated.isWaitForRunningActivityOnShutdown;
            await invalidateAll();
        } finally {
            isSavingActivity = false;
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
                            disabled={isSavingAuth || !canEditSettings}
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
                                disabled={isSavingAuth || !canEditSettings} />
                        </div>
                    {/if}

                    {#if canEditSettings}
                        <div class="flex justify-end border-t border-border pt-6">
                            <Button primary disabled={!isAuthDirty || isSavingAuth} onclick={onSaveAuth}>
                                {isSavingAuth ? "Saving…" : "Save"}
                            </Button>
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
                            disabled={isSavingActivity || !canEditSettings} />
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
                            disabled={isSavingActivity || !canEditSettings} />
                    </div>

                    {#if canEditSettings}
                        <div class="flex justify-end border-t border-border pt-6">
                            <Button primary disabled={!isActivityDirty || isSavingActivity} onclick={onSaveActivity}>
                                {isSavingActivity ? "Saving…" : "Save"}
                            </Button>
                        </div>
                    {/if}
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
    </div>
</DefaultLayout>
