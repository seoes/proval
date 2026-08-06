<script lang="ts">
    import { goto } from "$app/navigation";
    import Button from "$lib/components/atom/Button.svelte";
    import InputText from "$lib/components/atom/InputText.svelte";
    import FormField from "$lib/components/molecule/FormField.svelte";
    import Card from "$lib/components/layout/Card.svelte";
    import fetchApi from "$lib/utils";

    let email = $state("");
    let password = $state("");
    let errorMessage = $state("");
    let isSubmitting = $state(false);

    async function onSubmit(event: Event) {
        event.preventDefault();
        errorMessage = "";
        isSubmitting = true;
        try {
            const response = await fetchApi("/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({ error: "Registration failed" }));
                errorMessage = body.error ?? "Registration failed";
                return;
            }
            await goto("/", { invalidateAll: true });
        } finally {
            isSubmitting = false;
        }
    }
</script>

<svelte:head>
    <title>Register — Proval</title>
</svelte:head>

<div class="w-full">
    <div class="mb-8 text-center">
        <p class="text-3xl font-semibold tracking-tight text-neutral-800">Proval</p>
        <p class="mt-2 text-sm text-neutral-500">Create a new account.</p>
    </div>
    <Card border title="Register">
        <form class="space-y-4" onsubmit={onSubmit}>
            <FormField label="Email">
                {#snippet children({ id })}
                    <InputText {id} name="email" bind:value={email} required placeholder="you@example.com" />
                {/snippet}
            </FormField>
            <FormField label="Password">
                {#snippet children({ id })}
                    <InputText
                        {id}
                        name="password"
                        password
                        bind:value={password}
                        required
                        placeholder="At least 8 characters" />
                {/snippet}
            </FormField>
            {#if errorMessage}
                <p class="text-sm text-red-600">{errorMessage}</p>
            {/if}
            <Button type="submit" primary class="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Creating…" : "Create account"}
            </Button>
        </form>
        <p class="mt-4 text-center text-sm text-neutral-500">
            Already have an account?
            <a href="/login" class="font-medium text-primary hover:underline">Sign in</a>
        </p>
    </Card>
</div>
