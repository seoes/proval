<script lang="ts">
    import type { DashboardRange, TokenBreakdownItem, TokenSeriesPoint } from "@proval/types";

    interface Props {
        series: TokenSeriesPoint[];
        range: DashboardRange;
        byModel?: TokenBreakdownItem[];
        byRepository?: TokenBreakdownItem[];
    }

    const { series, range, byModel = [], byRepository = [] }: Props = $props();

    const WIDTH = 720;
    const HEIGHT = 168;
    const PAD = { top: 12, right: 4, bottom: 4, left: 4 };
    const DRAG_THRESHOLD_PX = 4;

    const RANGE_SUBTITLE: Record<DashboardRange, string> = {
        "24h": "last 24 hours",
        "7d": "last 7 days",
        "30d": "last 30 days",
        mtd: "month to date",
        year: "year to date",
    };

    const AVG_LABEL: Record<DashboardRange, string> = {
        "24h": "Avg / hour",
        "7d": "Avg / day",
        "30d": "Avg / day",
        mtd: "Avg / day",
        year: "Avg / month",
    };

    const PEAK_LABEL: Record<DashboardRange, string> = {
        "24h": "Peak hour",
        "7d": "Peak day",
        "30d": "Peak day",
        mtd: "Peak day",
        year: "Peak month",
    };

    function formatBucketLabel(iso: string, dashboardRange: DashboardRange): string {
        const date = new Date(iso);
        if (dashboardRange === "24h") {
            return `${String(date.getHours()).padStart(2, "0")}:00`;
        }
        if (dashboardRange === "year") {
            return date.toLocaleString("en-US", { month: "short" });
        }
        return `${date.getMonth() + 1}/${date.getDate()}`;
    }

    function shortLabel(label: string, max = 18): string {
        if (label.length <= max) return label;
        return `${label.slice(0, max - 1)}…`;
    }

    const labeledSeries = $derived(
        series.map((point) => ({
            ...point,
            label: formatBucketLabel(point.bucketStart, range),
        })),
    );

    const totalTokens = $derived(labeledSeries.reduce((sum, point) => sum + point.tokens, 0));
    const peak = $derived(
        labeledSeries.length === 0
            ? null
            : labeledSeries.reduce((best, point) => (point.tokens > best.tokens ? point : best), labeledSeries[0]),
    );
    const maxTokens = $derived(Math.max(...labeledSeries.map((point) => point.tokens), 1));

    const plotW = WIDTH - PAD.left - PAD.right;
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const baselineY = PAD.top + plotH;

    function xAt(index: number, length: number): number {
        if (length <= 1) return PAD.left;
        return PAD.left + (index / (length - 1)) * plotW;
    }

    function yAt(tokens: number, max: number): number {
        return PAD.top + plotH - (tokens / max) * plotH;
    }

    function linePathFrom(points: { x: number; y: number }[]): string {
        if (points.length === 0) return "";
        return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
    }

    function areaPathFrom(points: { x: number; y: number }[]): string {
        if (points.length === 0) return "";
        const line = linePathFrom(points);
        return `${line} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`;
    }

    const points = $derived(
        labeledSeries.map((point, index) => ({
            x: xAt(index, labeledSeries.length),
            y: yAt(point.tokens, maxTokens),
            ...point,
        })),
    );

    const linePath = $derived(linePathFrom(points));
    const areaPath = $derived(areaPathFrom(points));

    const xTicks = $derived.by(() => {
        const length = points.length;
        if (length === 0) return [];
        if (length === 1) {
            return [{ index: 0, label: points[0].label, align: "start" as const }];
        }
        const indexes = Array.from(
            new Set([0, Math.floor((length - 1) / 3), Math.floor(((length - 1) * 2) / 3), length - 1]),
        ).sort((a, b) => a - b);
        return indexes.map((index) => ({
            index,
            label: points[index].label,
            align: (index === 0 ? "start" : index === length - 1 ? "end" : "center") as "start" | "center" | "end",
        }));
    });

    let hoveredIndex = $state<number | null>(null);
    let chartEl = $state<HTMLDivElement | null>(null);

    let dragStartIndex = $state<number | null>(null);
    let dragEndIndex = $state<number | null>(null);
    let isDragging = $state(false);
    let dragActivated = $state(false);
    let dragOriginX = $state(0);

    const dragRange = $derived.by(() => {
        if (!isDragging || !dragActivated || dragStartIndex === null || dragEndIndex === null) return null;
        return {
            start: Math.min(dragStartIndex, dragEndIndex),
            end: Math.max(dragStartIndex, dragEndIndex),
        };
    });

    const hovered = $derived(hoveredIndex === null || dragRange || points.length === 0 ? null : points[hoveredIndex]);

    const rangeSum = $derived(
        dragRange
            ? labeledSeries.slice(dragRange.start, dragRange.end + 1).reduce((sum, point) => sum + point.tokens, 0)
            : null,
    );

    const rangeLabel = $derived(
        dragRange
            ? dragRange.start === dragRange.end
                ? labeledSeries[dragRange.start].label
                : `${labeledSeries[dragRange.start].label} – ${labeledSeries[dragRange.end].label}`
            : null,
    );

    const dragArea = $derived.by(() => {
        if (!dragRange) return null;
        const slice = points.slice(dragRange.start, dragRange.end + 1);
        if (slice.length === 0) return null;
        const left = slice[0].x;
        const right = slice[slice.length - 1].x;
        return {
            areaPath: areaPathFrom(slice),
            linePath: linePathFrom(slice),
            centerPct: ((left + right) / 2 / WIDTH) * 100,
        };
    });

    function formatTokens(value: number): string {
        if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
        if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
        return String(value);
    }

    function indexFromEvent(event: PointerEvent): number {
        if (!chartEl || labeledSeries.length === 0) return 0;
        const rect = chartEl.getBoundingClientRect();
        const ratio = (event.clientX - rect.left) / rect.width;
        return Math.max(0, Math.min(labeledSeries.length - 1, Math.round(ratio * (labeledSeries.length - 1))));
    }

    function resetDrag() {
        isDragging = false;
        dragActivated = false;
        dragStartIndex = null;
        dragEndIndex = null;
    }

    function onPointerDown(event: PointerEvent) {
        if (event.button !== 0 || !chartEl || labeledSeries.length === 0) return;
        const index = indexFromEvent(event);
        isDragging = true;
        dragActivated = false;
        dragOriginX = event.clientX;
        dragStartIndex = index;
        dragEndIndex = index;
        hoveredIndex = null;
        chartEl.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
        if (!chartEl || labeledSeries.length === 0) return;
        const index = indexFromEvent(event);

        if (isDragging && dragStartIndex !== null) {
            if (!dragActivated && Math.abs(event.clientX - dragOriginX) >= DRAG_THRESHOLD_PX) {
                dragActivated = true;
            }
            dragEndIndex = index;
            return;
        }

        hoveredIndex = index;
    }

    function onPointerUp(event: PointerEvent) {
        if (!isDragging) return;
        hoveredIndex = labeledSeries.length === 0 ? null : indexFromEvent(event);
        resetDrag();
        if (chartEl?.hasPointerCapture(event.pointerId)) {
            chartEl.releasePointerCapture(event.pointerId);
        }
    }

    function onPointerLeave() {
        if (!isDragging) hoveredIndex = null;
    }
</script>

{#snippet breakdownList(title: string, items: TokenBreakdownItem[])}
    <div class="min-w-0">
        <p class="text-[11px] font-medium tracking-wide text-neutral-400 uppercase">{title}</p>
        {#if items.length === 0}
            <p class="mt-1.5 text-xs text-neutral-400">—</p>
        {:else}
            <ul class="mt-1.5 space-y-1">
                {#each items as item (item.label)}
                    <li class="flex items-baseline justify-between gap-2 text-xs">
                        <span class="min-w-0 truncate text-neutral-600 dark:text-neutral-300" title={item.label}>
                            {shortLabel(item.label)}
                        </span>
                        <span class="shrink-0 tabular-nums text-neutral-800 dark:text-neutral-100">
                            {formatTokens(item.tokens)}
                        </span>
                    </li>
                {/each}
            </ul>
        {/if}
    </div>
{/snippet}

<div class="rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
    <div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 px-5 pt-5 pb-1">
        <div class="flex min-w-0 flex-wrap items-end gap-x-6 gap-y-3">
            <div>
                <div class="flex items-baseline gap-2">
                    <p class="text-2xl font-semibold tracking-tight text-neutral-800 tabular-nums dark:text-neutral-100">
                        {formatTokens(totalTokens)}
                    </p>
                    <span class="text-sm text-neutral-400">{RANGE_SUBTITLE[range]}</span>
                </div>
            </div>
            <div class="flex gap-5">
                <div>
                    <p class="text-xs text-neutral-400">{PEAK_LABEL[range]}</p>
                    <p class="mt-0.5 text-sm font-medium text-neutral-700 dark:text-neutral-200">
                        {#if peak}
                            {peak.label}
                            <span class="font-normal text-neutral-400">· {formatTokens(peak.tokens)}</span>
                        {:else}
                            —
                        {/if}
                    </p>
                </div>
                <div>
                    <p class="text-xs text-neutral-400">{AVG_LABEL[range]}</p>
                    <p class="mt-0.5 text-sm font-medium tabular-nums text-neutral-700 dark:text-neutral-200">
                        {labeledSeries.length === 0
                            ? "—"
                            : formatTokens(Math.round(totalTokens / labeledSeries.length))}
                    </p>
                </div>
            </div>
        </div>

        <div class="grid w-full min-w-0 grid-cols-2 gap-4 sm:w-auto sm:min-w-[16rem] sm:max-w-sm sm:shrink-0">
            {@render breakdownList("By Model", byModel)}
            {@render breakdownList("By Project", byRepository)}
        </div>
    </div>

    <div class="px-3 pt-2 pb-4 sm:px-4">
        {#if labeledSeries.length === 0}
            <div class="flex h-44 items-center justify-center">
                <p class="text-sm text-neutral-500">No token usage in this period.</p>
            </div>
        {:else}
            <div
                bind:this={chartEl}
                class="relative cursor-crosshair touch-none select-none"
                role="img"
                aria-label="Token usage for the selected period. Drag to preview a range total."
                onpointerdown={onPointerDown}
                onpointermove={onPointerMove}
                onpointerup={onPointerUp}
                onpointercancel={onPointerUp}
                onpointerleave={onPointerLeave}>
                <div class="relative pt-11">
                    {#if hovered && hoveredIndex !== null}
                        {@const leftPct = (hovered.x / WIDTH) * 100}
                        <div
                            class="pointer-events-none absolute top-0 z-20 -translate-x-1/2 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 shadow-sm dark:border-neutral-600 dark:bg-neutral-900"
                            style="left: clamp(3.5rem, {leftPct}%, calc(100% - 3.5rem))">
                            <p class="text-[11px] leading-none text-neutral-400">{hovered.label}</p>
                            <p class="mt-1 text-sm font-semibold tabular-nums text-neutral-800 dark:text-neutral-100">
                                {hovered.tokens.toLocaleString()}
                                <span class="text-xs font-normal text-neutral-400">tokens</span>
                            </p>
                        </div>
                    {:else if dragArea && rangeSum !== null && rangeLabel}
                        <div
                            class="pointer-events-none absolute top-0 z-20 -translate-x-1/2 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 shadow-sm dark:border-neutral-600 dark:bg-neutral-900"
                            style="left: clamp(4rem, {dragArea.centerPct}%, calc(100% - 4rem))">
                            <p class="text-[11px] leading-none text-neutral-400">{rangeLabel}</p>
                            <p class="mt-1 text-sm font-semibold tabular-nums text-neutral-800 dark:text-neutral-100">
                                {rangeSum.toLocaleString()}
                                <span class="text-xs font-normal text-neutral-400">tokens</span>
                            </p>
                        </div>
                    {/if}

                    <div class="relative">
                        <svg
                            viewBox="0 0 {WIDTH} {HEIGHT}"
                            class="h-44 w-full overflow-visible"
                            preserveAspectRatio="none">
                            <defs>
                                <linearGradient id="token-area-fill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.3" />
                                    <stop offset="50%" stop-color="var(--primary)" stop-opacity="0.1" />
                                    <stop offset="100%" stop-color="var(--primary)" stop-opacity="0" />
                                </linearGradient>
                                <linearGradient id="token-drag-fill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.55" />
                                    <stop offset="55%" stop-color="var(--primary)" stop-opacity="0.22" />
                                    <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.04" />
                                </linearGradient>
                            </defs>

                            <line
                                x1={PAD.left}
                                y1={baselineY}
                                x2={WIDTH - PAD.right}
                                y2={baselineY}
                                stroke="currentColor"
                                class="text-neutral-100 dark:text-neutral-700/80"
                                stroke-width="1"
                                vector-effect="non-scaling-stroke" />

                            <path d={areaPath} fill="url(#token-area-fill)" class="token-area" />
                            {#if dragArea}
                                <path d={dragArea.areaPath} fill="url(#token-drag-fill)" />
                            {/if}
                            <path
                                d={linePath}
                                fill="none"
                                stroke="var(--primary)"
                                stroke-width="2.25"
                                stroke-opacity={dragRange ? 0.35 : 1}
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                class="token-line"
                                vector-effect="non-scaling-stroke" />
                            {#if dragArea}
                                <path
                                    d={dragArea.linePath}
                                    fill="none"
                                    stroke="var(--primary)"
                                    stroke-width="2.75"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    vector-effect="non-scaling-stroke" />
                            {/if}

                            {#if hovered}
                                <line
                                    x1={hovered.x}
                                    y1={PAD.top}
                                    x2={hovered.x}
                                    y2={baselineY}
                                    stroke="var(--primary)"
                                    stroke-opacity="0.22"
                                    stroke-width="1"
                                    stroke-dasharray="4 3"
                                    vector-effect="non-scaling-stroke" />
                            {/if}
                        </svg>

                        {#if hovered && hoveredIndex !== null}
                            {@const leftPct = (hovered.x / WIDTH) * 100}
                            {@const topPct = (hovered.y / HEIGHT) * 100}
                            <div
                                class="pointer-events-none absolute z-10 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-white dark:bg-neutral-800"
                                style="left: {leftPct}%; top: {topPct}%"></div>
                        {/if}
                    </div>
                </div>
            </div>

            <div class="relative mt-1.5 h-4">
                {#each xTicks as tick (tick.index)}
                    {@const leftPct = (tick.index / Math.max(labeledSeries.length - 1, 1)) * 100}
                    <span
                        class="absolute text-[11px] text-neutral-400 {tick.align === 'start'
                            ? 'translate-x-0'
                            : tick.align === 'end'
                              ? '-translate-x-full'
                              : '-translate-x-1/2'}"
                        style="left: {leftPct}%">
                        {tick.label}
                    </span>
                {/each}
            </div>
        {/if}
    </div>
</div>

<style>
    .token-area {
        animation: token-fade-in 0.65s ease-out both;
    }

    .token-line {
        stroke-dasharray: 2000;
        stroke-dashoffset: 2000;
        animation: token-draw 1.05s cubic-bezier(0.22, 1, 0.36, 1) 0.08s forwards;
    }

    @keyframes token-fade-in {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }

    @keyframes token-draw {
        to {
            stroke-dashoffset: 0;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .token-area,
        .token-line {
            animation: none;
            stroke-dasharray: none;
            stroke-dashoffset: 0;
        }
    }
</style>
