#!/usr/bin/env bun
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, statSync } from "node:fs";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fontDir = resolve(root, "scripts/og-font");
const outDir = resolve(root, "static");

const PRIMARY = "#006fea";
const INK = "#0a0a0a";
const MUTED = "#525252";

type TitlePart = { text: string; accent?: boolean };

type Card = {
    file: string;
    eyebrow: string;
    titleLineList: TitlePart[][];
    sub: string;
};

type El = {
    type: string;
    props: Record<string, unknown>;
};

function el(type: string, props: Record<string, unknown> | null, ...childList: unknown[]): El {
    const flat = childList.flat(Infinity).filter((c) => c != null && c !== false);
    return {
        type,
        props: {
            ...(props ?? {}),
            children: flat.length <= 1 ? (flat[0] ?? undefined) : flat,
        },
    };
}

const cardList: Card[] = [
    {
        file: "og.png",
        eyebrow: "Self-hosted",
        titleLineList: [[{ text: "AI code review" }], [{ text: "on your infrastructure", accent: true }]],
        sub: "Bring your own model. GitLab, Forgejo, and GitHub. Open source.",
    },
    {
        file: "og-alternatives.png",
        eyebrow: "Alternatives",
        titleLineList: [[{ text: "AI code review" }], [{ text: "alternatives", accent: true }]],
        sub: "Compare Proval to CodeRabbit, Qodo, Greptile, and Graphite.",
    },
    {
        file: "og-coderabbit.png",
        eyebrow: "Alternatives",
        titleLineList: [[{ text: "Proval vs\u00A0" }, { text: "CodeRabbit", accent: true }]],
        sub: "Self-hosted AI code review with your own model on your infrastructure.",
    },
    {
        file: "og-qodo.png",
        eyebrow: "Alternatives",
        titleLineList: [[{ text: "Proval vs\u00A0" }, { text: "Qodo", accent: true }]],
        sub: "Self-hosted AI code review with your own model on your infrastructure.",
    },
    {
        file: "og-greptile.png",
        eyebrow: "Alternatives",
        titleLineList: [[{ text: "Proval vs\u00A0" }, { text: "Greptile", accent: true }]],
        sub: "Self-hosted AI code review with your own model on your infrastructure.",
    },
    {
        file: "og-graphite.png",
        eyebrow: "Alternatives",
        titleLineList: [[{ text: "Proval vs\u00A0" }, { text: "Graphite", accent: true }]],
        sub: "Self-hosted AI code review with your own model on your infrastructure.",
    },
];

function cardElement(card: Card): El {
    const titleChildList = card.titleLineList.map((partList) =>
        el(
            "div",
            {
                style: {
                    display: "flex",
                    flexDirection: "row",
                    flexWrap: "wrap",
                },
            },
            ...partList.map((part) =>
                el(
                    "span",
                    {
                        style: {
                            color: part.accent ? PRIMARY : INK,
                        },
                    },
                    part.text,
                ),
            ),
        ),
    );

    return el(
        "div",
        {
            style: {
                position: "relative",
                width: "1200px",
                height: "630px",
                display: "flex",
                flexDirection: "column",
                padding: "64px 72px 80px",
                backgroundImage: "linear-gradient(160deg, #ffffff 0%, #eef5ff 55%, #dbeafe 100%)",
                overflow: "hidden",
                fontFamily: "Inter",
            },
        },
        el(
            "div",
            {
                style: {
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexShrink: 0,
                    width: "100%",
                },
            },
            el(
                "div",
                {
                    style: {
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: "14px",
                    },
                },
                el(
                    "div",
                    {
                        style: {
                            width: "52px",
                            height: "52px",
                            borderRadius: "14px",
                            backgroundColor: PRIMARY,
                            color: "#ffffff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "28px",
                            fontWeight: 700,
                            letterSpacing: "-0.06em",
                            fontFamily: "Inter",
                        },
                    },
                    "P",
                ),
                el(
                    "div",
                    {
                        style: {
                            fontSize: "26px",
                            fontWeight: 700,
                            letterSpacing: "-0.045em",
                            color: INK,
                            fontFamily: "Inter",
                        },
                    },
                    "Proval",
                ),
            ),
            el(
                "div",
                {
                    style: {
                        fontFamily: "JetBrains Mono",
                        fontSize: "16px",
                        fontWeight: 700,
                        letterSpacing: "0.2em",
                        textTransform: "uppercase",
                        color: PRIMARY,
                    },
                },
                card.eyebrow,
            ),
        ),
        el(
            "div",
            {
                style: {
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    flexGrow: 1,
                    maxWidth: "1040px",
                    paddingBottom: "8px",
                },
            },
            el(
                "div",
                {
                    style: {
                        display: "flex",
                        flexDirection: "column",
                        fontSize: "92px",
                        lineHeight: 0.94,
                        fontWeight: 700,
                        letterSpacing: "-0.06em",
                        fontFamily: "Inter",
                    },
                },
                ...titleChildList,
            ),
            el(
                "div",
                {
                    style: {
                        marginTop: "28px",
                        maxWidth: "860px",
                        fontSize: "28px",
                        lineHeight: 1.4,
                        fontWeight: 500,
                        letterSpacing: "-0.025em",
                        color: MUTED,
                        fontFamily: "Inter",
                    },
                },
                card.sub,
            ),
        ),
        el("div", {
            style: {
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: "14px",
                backgroundColor: PRIMARY,
            },
        }),
    );
}

async function loadFont(fileName: string): Promise<ArrayBuffer> {
    const path = resolve(fontDir, fileName);
    if (!existsSync(path)) {
        throw new Error(`OG font missing: ${path}`);
    }
    const file = Bun.file(path);
    if (!(await file.exists()) || file.size === 0) {
        throw new Error(`OG font missing or empty: ${path}`);
    }
    return file.arrayBuffer();
}

const fontList = [
    {
        name: "Inter",
        data: await loadFont("Inter-Medium.ttf"),
        weight: 500 as const,
        style: "normal" as const,
    },
    {
        name: "Inter",
        data: await loadFont("Inter-Bold.ttf"),
        weight: 700 as const,
        style: "normal" as const,
    },
    {
        name: "JetBrains Mono",
        data: await loadFont("JetBrainsMono-Bold.ttf"),
        weight: 700 as const,
        style: "normal" as const,
    },
];

async function render(card: Card) {
    const out = resolve(outDir, card.file);
    const svg = await satori(cardElement(card) as never, {
        width: 1200,
        height: 630,
        fonts: fontList,
    });
    const png = new Resvg(svg, {
        fitTo: { mode: "width", value: 1200 },
    })
        .render()
        .asPng();
    await Bun.write(out, png);
    if (!existsSync(out) || statSync(out).size < 10_000) {
        throw new Error(`Missing or tiny PNG for ${card.file}`);
    }
    console.log(`ok ${card.file} (${statSync(out).size} bytes)`);
}

for (const card of cardList) {
    await render(card);
}
