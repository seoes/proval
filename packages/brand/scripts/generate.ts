#!/usr/bin/env bun
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const brandRoot = resolve(import.meta.dir, "..");
const markSvgPath = resolve(brandRoot, "mark.svg");
const iconDir = resolve(brandRoot, "icon");

const markSvg = await Bun.file(markSvgPath).text();
if (!markSvg.trim()) {
    throw new Error(`Missing brand mark at ${markSvgPath}`);
}

function rasterize(svg: string, size: number): Uint8Array {
    return new Resvg(svg, {
        fitTo: { mode: "width", value: size },
    })
        .render()
        .asPng();
}

function pngToIco(pngList: Uint8Array[]): Uint8Array {
    const count = pngList.length;
    const headerSize = 6 + 16 * count;
    let offset = headerSize;
    const entryList = pngList.map((png) => {
        const entry = { bytes: png.byteLength, offset };
        offset += png.byteLength;
        return entry;
    });
    const out = new Uint8Array(offset);
    const view = new DataView(out.buffer);
    view.setUint16(0, 0, true);
    view.setUint16(2, 1, true);
    view.setUint16(4, count, true);
    let cursor = 6;
    for (const [index, entry] of entryList.entries()) {
        const size = index === 0 ? 16 : 32;
        out[cursor] = size;
        out[cursor + 1] = size;
        out[cursor + 2] = 0;
        out[cursor + 3] = 0;
        view.setUint16(cursor + 4, 1, true);
        view.setUint16(cursor + 6, 32, true);
        view.setUint32(cursor + 8, entry.bytes, true);
        view.setUint32(cursor + 12, entry.offset, true);
        cursor += 16;
    }
    for (const [index, png] of pngList.entries()) {
        out.set(png, entryList[index].offset);
    }
    return out;
}

mkdirSync(iconDir, { recursive: true });

await Bun.write(resolve(iconDir, "favicon.svg"), markSvg);
await Bun.write(resolve(iconDir, "apple-touch-icon.png"), rasterize(markSvg, 180));
await Bun.write(resolve(iconDir, "icon-512.png"), rasterize(markSvg, 512));
await Bun.write(resolve(iconDir, "favicon.ico"), pngToIco([rasterize(markSvg, 16), rasterize(markSvg, 32)]));

console.log("ok packages/brand/icon/favicon.svg");
console.log("ok packages/brand/icon/favicon.ico");
console.log("ok packages/brand/icon/apple-touch-icon.png");
console.log("ok packages/brand/icon/icon-512.png");
