<script lang="ts">
    import Button from '$lib/components/atom/Button.svelte';
    import InputText from '$lib/components/atom/InputText.svelte';
    import FormField from '$lib/components/molecule/FormField.svelte';
    import Select from '$lib/components/atom/Select.svelte';

    let {
        formProvider = $bindable<'gitlab' | 'forgejo'>(),
        formName = $bindable(''),
        formBaseUrl = $bindable(''),
        formAccessToken = $bindable(''),
        editingId,
        isSavingAccess,
        onSubmit,
        onCancel
    }: {
        formProvider: 'gitlab' | 'forgejo';
        formName: string;
        formBaseUrl: string;
        formAccessToken: string;
        editingId: number | null;
        isSavingAccess: boolean;
        onSubmit: () => void;
        onCancel: () => void;
    } = $props();

    const title = $derived(
        editingId !== null
            ? 'Edit Access'
            : formProvider === 'gitlab'
              ? 'Add GitLab connection'
              : 'Add Forgejo connection'
    );

    const accessFormNamePlaceholder = $derived(
        formProvider === 'gitlab' ? 'Production GitLab' : 'Team Forgejo'
    );
    const accessFormBaseUrlPlaceholder = $derived(
        formProvider === 'gitlab' ? 'https://gitlab.example.com' : 'https://forgejo.example.com'
    );
    const accessFormTokenPlaceholder = $derived(
        formProvider === 'gitlab' ? 'glpat-xxxxxxxxxxxxxxxxxxxx' : 'Forgejo personal access token'
    );
    const accessFormTokenDescription = $derived(
        formProvider === 'gitlab'
            ? 'Personal or project token with api scope'
            : 'Personal access token with API scope (e.g. read_api, write_repository)'
    );
    const accessFormBaseUrlDescription = $derived(
        formProvider === 'gitlab'
            ? 'Root URL of your GitLab instance'
            : 'Root URL of your Forgejo instance'
    );
</script>

<h3 class="mb-4 text-lg font-semibold tracking-tight dark:text-neutral-50">
    {title}
</h3>
<div class="space-y-4">
    <FormField label="Provider">
        {#snippet children({ id })}
            <Select
                {id}
                options={[
                    { value: 'gitlab', label: 'GitLab' },
                    { value: 'forgejo', label: 'Forgejo' }
                ]}
                value={formProvider}
                disabled={editingId !== null}
                onchange={(e) =>
                    (formProvider = (e.target as HTMLSelectElement).value as 'gitlab' | 'forgejo')}
            />
        {/snippet}
    </FormField>
    <FormField label="Name" description="A friendly label for this connection">
        {#snippet children({ id })}
            <InputText {id} placeholder={accessFormNamePlaceholder} bind:value={formName} />
        {/snippet}
    </FormField>
    <FormField label="Base URL" description={accessFormBaseUrlDescription}>
        {#snippet children({ id })}
            <InputText {id} placeholder={accessFormBaseUrlPlaceholder} bind:value={formBaseUrl} />
        {/snippet}
    </FormField>
    {#if editingId === null}
        <FormField label="Access token" description={accessFormTokenDescription}>
            {#snippet children({ id })}
                <InputText
                    {id}
                    placeholder={accessFormTokenPlaceholder}
                    bind:value={formAccessToken}
                    password
                />
            {/snippet}
        </FormField>
    {/if}
    <div class="flex items-center gap-2 pt-2">
        <Button primary onclick={onSubmit} disabled={isSavingAccess} class="w-auto">
            {isSavingAccess ? 'Saving...' : editingId !== null ? 'Update' : 'Save'}
        </Button>
        <Button secondary onclick={onCancel} disabled={isSavingAccess} class="w-auto">
            Cancel
        </Button>
    </div>
</div>
