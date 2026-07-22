<script lang="ts">
    import { onMount } from "svelte";

    let { html, class: className = "" }: { html: string; class?: string } = $props();

    let articleEl: HTMLElement | undefined = $state();

    onMount(() => {
        if (!articleEl) return;

        for (const pre of articleEl.querySelectorAll("pre")) {
            if (pre.parentElement?.classList.contains("doc-code-wrap")) continue;

            const wrap = document.createElement("div");
            wrap.className = "doc-code-wrap";
            pre.parentNode?.insertBefore(wrap, pre);
            wrap.appendChild(pre);

            const button = document.createElement("button");
            button.type = "button";
            button.className = "doc-copy-btn";
            button.textContent = "Copy";
            button.addEventListener("click", () => {
                const code = pre.querySelector("code");
                const text = code?.textContent ?? pre.textContent ?? "";
                void navigator.clipboard.writeText(text).then(
                    () => {
                        button.textContent = "Copied";
                        setTimeout(() => {
                            button.textContent = "Copy";
                        }, 2000);
                    },
                    () => {
                        button.textContent = "Failed";
                        setTimeout(() => {
                            button.textContent = "Copy";
                        }, 2000);
                    },
                );
            });
            wrap.appendChild(button);
        }

        for (const table of articleEl.querySelectorAll("table")) {
            if (table.parentElement?.classList.contains("doc-table-wrap")) continue;

            const wrap = document.createElement("div");
            wrap.className = "doc-table-wrap";
            table.parentNode?.insertBefore(wrap, table);
            wrap.appendChild(table);
        }
    });
</script>

<div bind:this={articleEl} class={["prose", className].filter(Boolean).join(" ")}>
    {@html html}
</div>
