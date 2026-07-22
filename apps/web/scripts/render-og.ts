#!/usr/bin/env bun
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { unlinkSync, existsSync, statSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = resolve(root, "scripts/og-html/card.html");
const outDir = resolve(root, "static");
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

type Card = {
    file: string;
    eyebrow: string;
    titleHtml: string;
    sub: string;
};

const cards: Card[] = [
    {
        file: "og.png",
        eyebrow: "Self-hosted",
        titleHtml: 'AI code review<br /><span class="accent">on your infrastructure</span>',
        sub: "Bring your own model. GitLab, Forgejo, and GitHub. Open source.",
    },
    {
        file: "og-alternatives.png",
        eyebrow: "Alternatives",
        titleHtml: 'AI code review<br /><span class="accent">alternatives</span>',
        sub: "Compare Proval to CodeRabbit, Qodo, Greptile, and Graphite.",
    },
    {
        file: "og-coderabbit.png",
        eyebrow: "Alternatives",
        titleHtml: 'Proval vs <span class="accent">CodeRabbit</span>',
        sub: "Self-hosted AI code review with your own model on your infrastructure.",
    },
    {
        file: "og-qodo.png",
        eyebrow: "Alternatives",
        titleHtml: 'Proval vs <span class="accent">Qodo</span>',
        sub: "Self-hosted AI code review with your own model on your infrastructure.",
    },
    {
        file: "og-greptile.png",
        eyebrow: "Alternatives",
        titleHtml: 'Proval vs <span class="accent">Greptile</span>',
        sub: "Self-hosted AI code review with your own model on your infrastructure.",
    },
    {
        file: "og-graphite.png",
        eyebrow: "Alternatives",
        titleHtml: 'Proval vs <span class="accent">Graphite</span>',
        sub: "Self-hosted AI code review with your own model on your infrastructure.",
    },
];

async function render(card: Card) {
    const out = resolve(outDir, card.file);
    if (existsSync(out)) unlinkSync(out);

    const query = new URLSearchParams({
        eyebrow: card.eyebrow,
        titleHtml: card.titleHtml,
        sub: card.sub,
    });
    const url = `file://${htmlPath}?${query.toString()}`;

    const proc = Bun.spawn(
        [
            chrome,
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--force-device-scale-factor=1",
            "--no-sandbox",
            `--screenshot=${out}`,
            "--window-size=1200,630",
            url,
        ],
        {
            stdout: "inherit",
            stderr: "inherit",
            cwd: outDir,
        },
    );

    const exit = await proc.exited;
    if (exit !== 0) throw new Error(`Chrome failed for ${card.file} with exit ${exit}`);
    if (!existsSync(out) || statSync(out).size < 10_000) {
        throw new Error(`Missing or tiny screenshot for ${card.file}`);
    }
    console.log(`ok ${card.file} (${statSync(out).size} bytes)`);
}

for (const card of cards) {
    await render(card);
}
