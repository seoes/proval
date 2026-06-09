<script lang="ts">
    import { GITHUB_URL } from "../constants";
</script>

<footer class="border-t border-neutral-200 bg-white py-10">
    <div
        class="mx-auto flex max-w-6xl flex-col gap-4 px-4 text-sm text-neutral-600 sm:flex-row sm:items-center sm:justify-between">
        <p>Self-hosted AI code review infrastructure. AGPL-3.0.</p>
        <nav class="flex gap-6">
            <a href="/docs" class="hover:text-primary">Docs</a>
            <a href="/blog" class="hover:text-primary">Blog</a>
            <a href={GITHUB_URL} class="hover:text-primary" target="_blank" rel="noopener noreferrer"> GitHub </a>
        </nav>
    </div>
</footer>
