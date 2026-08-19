<script lang="ts">
    import { goto } from "$app/navigation";
    import Button from "$lib/components/atom/Button.svelte";
    import InputText from "$lib/components/atom/InputText.svelte";
    import FormField from "$lib/components/molecule/FormField.svelte";
    import Card from "$lib/components/layout/Card.svelte";
    import ProvalMark from "$lib/components/atom/ProvalMark.svelte";
    import fetchApi from "$lib/utils";
    import type { PageProps } from "./$types";

    let { data }: PageProps = $props();

    let email = $state("");
    let password = $state("");
    let errorMessage = $state("");
    let isSubmitting = $state(false);

    async function onSubmit(event: Event) {
        event.preventDefault();
        errorMessage = "";
        isSubmitting = true;
        try {
            const response = await fetchApi("/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({ error: "Login failed" }));
                errorMessage = body.error ?? "Login failed";
                return;
            }
            const next = data.nextPath || "/";
            await goto(next, { invalidateAll: true });
        } finally {
            isSubmitting = false;
        }
    }
</script>

<svelte:head>
    <title>Login — Proval</title>
</svelte:head>

<div class="w-full">
    <div class="mb-8 flex flex-col items-center text-center">
        <ProvalMark wordmark class="size-10" wordmarkClass="text-3xl font-semibold tracking-tight text-neutral-800" />
        <p class="mt-3 text-sm text-neutral-500">Sign in to continue.</p>
    </div>
    <Card border title="Login">
        <form class="space-y-4" onsubmit={onSubmit}>
            <FormField label="Email">
                {#snippet children({ id })}
                    <InputText {id} name="email" bind:value={email} required placeholder="you@example.com" />
                {/snippet}
            </FormField>
            <FormField label="Password">
                {#snippet children({ id })}
                    <InputText {id} name="password" password bind:value={password} required />
                {/snippet}
            </FormField>
            {#if errorMessage}
                <p class="text-sm text-red-600">{errorMessage}</p>
            {/if}
            <Button type="submit" primary class="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
        </form>
        {#if data.auth.isRegistrationEnabled}
            <p class="mt-4 text-center text-sm text-neutral-500">
                No account?
                <a href="/register" class="font-medium text-primary hover:underline">Register</a>
            </p>
        {/if}
    </Card>
</div>
