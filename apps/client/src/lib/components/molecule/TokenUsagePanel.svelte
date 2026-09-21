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
    const Y_AXIS_WIDTH = 44;
    const PAD = { top: 12, right: 8, bottom: 4, left: 0 };
    const BAR_GAP_RATIO = 0.35;

    const COLOR_INPUT = "var(--primary)";
    const COLOR_OUTPUT = "rgb(130, 99, 240)";
    const COLOR_CACHE = "rgb(232, 237, 243)";

    const RANGE_SUBTITLE: Record<DashboardRange, string> = {
        "24h": "last 24 hours",
        "7d": "last 7 days",
        "30d": "last 30 days",
        mtd: "month to date",
        year: "year to date",
    };

    type SegmentKey = "input" | "output" | "cache";

    const SEGMENT_META: { key: SegmentKey; label: string; color: string }[] = [
        { key: "input", label: "Input Tokens", color: COLOR_INPUT },
        { key: "output", label: "Output Tokens", color: COLOR_OUTPUT },
        { key: "cache", label: "Cache / Other", color: COLOR_CACHE },
    ];

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

    function uncachedInput(inputToken: number, cachedInputToken: number): number {
        return Math.max(0, inputToken - cachedInputToken);
    }

    function segmentValue(
        point: Pick<TokenSeriesPoint, "inputToken" | "outputToken" | "cachedInputToken">,
        key: SegmentKey,
    ): number {
        if (key === "input") return uncachedInput(point.inputToken, point.cachedInputToken);
        if (key === "output") return point.outputToken;
        return point.cachedInputToken;
    }

    function stackHeight(point: Pick<TokenSeriesPoint, "inputToken" | "outputToken" | "cachedInputToken">): number {
        return segmentValue(point, "input") + segmentValue(point, "output") + segmentValue(point, "cache");
    }

    const labeledSeries = $derived(
        series.map((point) => ({
            ...point,
            label: formatBucketLabel(point.bucketStart, range),
        })),
    );

    const totalTokens = $derived(labeledSeries.reduce((sum, point) => sum + point.tokens, 0));

    const periodSegments = $derived.by(() => {
        let input = 0;
        let output = 0;
        let cache = 0;
        for (const point of labeledSeries) {
            input += segmentValue(point, "input");
            output += segmentValue(point, "output");
            cache += segmentValue(point, "cache");
        }
        const segmentSum = input + output + cache;
        return { input, output, cache, segmentSum };
    });

    function segmentPercent(value: number, segmentSum: number): string {
        if (segmentSum <= 0) return "0%";
        return `${Math.round((value / segmentSum) * 100)}%`;
    }

    const maxStack = $derived(Math.max(...labeledSeries.map(stackHeight), 1));

    const yTicks = $derived.by(() => {
        const max = maxStack;
        const step = max <= 4 ? 1 : max / 4;
        const ticks: number[] = [];
        for (let value = 0; value <= max + step * 0.01; value += step) {
            ticks.push(Math.round(value));
        }
        const last = ticks[ticks.length - 1];
        if (last === undefined || last < max) {
            ticks.push(Math.round(max));
        }
        return [...new Set(ticks)].sort((a, b) => a - b);
    });

    const plotW = WIDTH - Y_AXIS_WIDTH - PAD.right;
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const baselineY = PAD.top + plotH;

    function yAt(stackValue: number, max: number): number {
        return PAD.top + plotH - (stackValue / max) * plotH;
    }

    type BarSegment = {
        key: SegmentKey;
        y: number;
        height: number;
        color: string;
        isTop: boolean;
    };

    type BarLayout = {
        index: number;
        x: number;
        width: number;
        centerX: number;
        segments: BarSegment[];
        total: number;
        label: string;
        inputToken: number;
        outputToken: number;
        cachedInputToken: number;
        tokens: number;
    };

    const bars = $derived.by((): BarLayout[] => {
        const length = labeledSeries.length;
        if (length === 0) return [];
        const slotW = plotW / length;
        const barW = Math.max(2, slotW * (1 - BAR_GAP_RATIO));

        return labeledSeries.map((point, index) => {
            const x = index * slotW + (slotW - barW) / 2;
            const centerX = x + barW / 2;
            const segmentsRaw: { key: SegmentKey; value: number; color: string }[] = [
                { key: "input", value: segmentValue(point, "input"), color: COLOR_INPUT },
                { key: "output", value: segmentValue(point, "output"), color: COLOR_OUTPUT },
                { key: "cache", value: segmentValue(point, "cache"), color: COLOR_CACHE },
            ].filter((seg): seg is { key: SegmentKey; value: number; color: string } => seg.value > 0);

            let cursorY = baselineY;
            const segments: BarSegment[] = [];
            for (let i = 0; i < segmentsRaw.length; i++) {
                const seg = segmentsRaw[i];
                const height = (seg.value / maxStack) * plotH;
                const y = cursorY - height;
                segments.push({
                    key: seg.key,
                    y,
                    height,
                    color: seg.color,
                    isTop: i === segmentsRaw.length - 1,
                });
                cursorY = y;
            }

            return {
                index,
                x,
                width: barW,
                centerX,
                segments,
                total: stackHeight(point),
                label: point.label,
                inputToken: point.inputToken,
                outputToken: point.outputToken,
                cachedInputToken: point.cachedInputToken,
                tokens: point.tokens,
            };
        });
    });

    const xTicks = $derived.by(() => {
        const length = bars.length;
        if (length === 0) return [];
        if (length === 1) {
            return [
                { index: 0, label: bars[0].label, leftPct: (bars[0].centerX / plotW) * 100, align: "start" as const },
            ];
        }
        const indexes = Array.from(
            new Set([0, Math.floor((length - 1) / 3), Math.floor(((length - 1) * 2) / 3), length - 1]),
        ).sort((a, b) => a - b);
        return indexes.map((index) => ({
            index,
            label: bars[index].label,
            leftPct: (bars[index].centerX / plotW) * 100,
            align: (index === 0 ? "start" : index === length - 1 ? "end" : "center") as "start" | "center" | "end",
        }));
    });

    let hoveredIndex = $state<number | null>(null);
    let chartEl = $state<HTMLDivElement | null>(null);

    const hoveredBar = $derived(hoveredIndex === null || bars.length === 0 ? null : bars[hoveredIndex]);

    function formatTokens(value: number): string {
        if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
        if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
        return String(value);
    }

    function formatTokensFull(value: number): string {
        return value.toLocaleString();
    }

    function indexFromEvent(event: PointerEvent): number {
        if (!chartEl || bars.length === 0) return 0;
        const rect = chartEl.getBoundingClientRect();
        const ratio = (event.clientX - rect.left) / rect.width;
        const xSvg = ratio * plotW;
        let best = 0;
        let bestDist = Infinity;
        for (const bar of bars) {
            const dist = Math.abs(bar.centerX - xSvg);
            if (dist < bestDist) {
                bestDist = dist;
                best = bar.index;
            }
        }
        return best;
    }

    function onPointerMove(event: PointerEvent) {
        if (!chartEl || bars.length === 0) return;
        hoveredIndex = indexFromEvent(event);
    }

    function onPointerLeave() {
        hoveredIndex = null;
    }

    function onPointerUp(event: PointerEvent) {
        if (event.pointerType !== "touch") return;
        hoveredIndex = null;
    }

    function roundedTopRectPath(x: number, y: number, w: number, h: number, r: number): string {
        const radius = Math.min(r, w / 2, h);
        if (radius <= 0 || h <= 0) {
            return `M ${x} ${y + h} L ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} Z`;
        }
        return [
            `M ${x} ${y + h}`,
            `L ${x} ${y + radius}`,
            `Q ${x} ${y} ${x + radius} ${y}`,
            `L ${x + w - radius} ${y}`,
            `Q ${x + w} ${y} ${x + w} ${y + radius}`,
            `L ${x + w} ${y + h}`,
            "Z",
        ].join(" ");
    }
    function yTickTopPercent(tick: number, max: number): number {
        return (yAt(tick, max) / HEIGHT) * 100;
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
                        <span class="shrink-0 text-neutral-800 tabular-nums dark:text-neutral-100">
                            {formatTokens(item.tokens)}
                        </span>
                    </li>
                {/each}
            </ul>
        {/if}
    </div>
{/snippet}

{#snippet segmentRow(key: SegmentKey, value: number, segmentSum: number)}
    {@const meta = SEGMENT_META.find((item) => item.key === key)!}
    <li class="flex items-center gap-2 text-sm">
        <span class="size-2 shrink-0 rounded-full" style="background-color: {meta.color}"></span>
        <span class="min-w-0 flex-1 text-neutral-600 dark:text-neutral-300">{meta.label}</span>
        <span class="shrink-0 text-neutral-800 tabular-nums dark:text-neutral-100">{formatTokensFull(value)}</span>
        <span class="w-10 shrink-0 text-right text-neutral-400 tabular-nums">{segmentPercent(value, segmentSum)}</span>
    </li>
{/snippet}

<div class="rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
    <div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 px-5 pt-5 pb-1">
        <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-baseline gap-2">
                <p class="text-2xl font-semibold tracking-tight text-neutral-800 tabular-nums dark:text-neutral-100">
                    {formatTokensFull(totalTokens)}
                </p>
                <span class="text-sm text-neutral-400">{RANGE_SUBTITLE[range]}</span>
            </div>
            {#if labeledSeries.length > 0}
                <ul class="mt-3 max-w-sm space-y-1.5">
                    {@render segmentRow("input", periodSegments.input, periodSegments.segmentSum)}
                    {@render segmentRow("output", periodSegments.output, periodSegments.segmentSum)}
                    {@render segmentRow("cache", periodSegments.cache, periodSegments.segmentSum)}
                </ul>
            {/if}
        </div>

        <div
            class="hidden min-w-0 gap-4 lg:grid lg:w-auto lg:shrink-0 {byRepository.length > 0
                ? 'lg:max-w-sm lg:min-w-[16rem] lg:grid-cols-2'
                : 'lg:max-w-xs lg:min-w-[8rem] lg:grid-cols-1'}">
            {@render breakdownList("By Model", byModel)}
            {#if byRepository.length > 0}
                {@render breakdownList("By Repository", byRepository)}
            {/if}
        </div>
    </div>

    <div class="px-3 pt-2 pb-4 sm:px-4">
        {#if labeledSeries.length === 0}
            <div class="flex h-44 items-center justify-center">
                <p class="text-sm text-neutral-500">No token usage in this period.</p>
            </div>
        {:else}
            <div
                class="relative select-none"
                role="img"
                aria-label="Token usage stacked bar chart for the selected period"
                onpointerleave={onPointerLeave}
                onpointerup={onPointerUp}
                onpointercancel={onPointerLeave}>
                <div class="relative pt-14">
                    <div class="flex h-44">
                        <div class="relative w-11 shrink-0" aria-hidden="true">
                            {#each yTicks as tick (tick)}
                                <span
                                    class="absolute right-1 -translate-y-1/2 text-[10px] leading-none text-neutral-400 tabular-nums"
                                    style="top: {yTickTopPercent(tick, maxStack)}%">
                                    {formatTokens(tick)}
                                </span>
                            {/each}
                        </div>
                        <div bind:this={chartEl} class="relative min-w-0 flex-1" onpointermove={onPointerMove}>
                            {#if hoveredBar}
                                {@const leftPct = (hoveredBar.centerX / plotW) * 100}
                                {@const hInput = segmentValue(hoveredBar, "input")}
                                {@const hOutput = hoveredBar.outputToken}
                                {@const hCache = hoveredBar.cachedInputToken}
                                <div
                                    class="pointer-events-none absolute top-0 z-20 -translate-x-1/2 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 shadow-sm dark:border-neutral-600 dark:bg-neutral-900"
                                    style="left: clamp(2rem, {leftPct}%, calc(100% - 2rem))">
                                    <p class="text-[11px] leading-none text-neutral-400">{hoveredBar.label}</p>
                                    <p
                                        class="mt-1 text-sm font-semibold text-neutral-800 tabular-nums dark:text-neutral-100">
                                        {formatTokensFull(hoveredBar.tokens)}
                                        <span class="text-xs font-normal text-neutral-400">total</span>
                                    </p>
                                    <p class="mt-1 text-[11px] text-neutral-500 tabular-nums">
                                        In {formatTokensFull(hInput)} · Out {formatTokensFull(hOutput)} · Cache {formatTokensFull(
                                            hCache,
                                        )}
                                    </p>
                                </div>
                            {/if}

                            <svg
                                viewBox="0 0 {plotW} {HEIGHT}"
                                class="h-full w-full overflow-visible"
                                preserveAspectRatio="none">
                                {#each yTicks as tick (tick)}
                                    {@const y = yAt(tick, maxStack)}
                                    <line
                                        x1={0}
                                        y1={y}
                                        x2={plotW}
                                        y2={y}
                                        stroke="currentColor"
                                        class="text-neutral-100 dark:text-neutral-700/80"
                                        stroke-width="1"
                                        vector-effect="non-scaling-stroke" />
                                {/each}

                                <line
                                    x1={0}
                                    y1={baselineY}
                                    x2={plotW}
                                    y2={baselineY}
                                    stroke="currentColor"
                                    class="text-neutral-200 dark:text-neutral-600"
                                    stroke-width="1"
                                    vector-effect="non-scaling-stroke" />

                                {#each bars as bar (bar.index)}
                                    {#each bar.segments as seg (seg.key)}
                                        {#if seg.isTop}
                                            <path
                                                d={roundedTopRectPath(bar.x, seg.y, bar.width, seg.height, 3)}
                                                fill={seg.color}
                                                opacity={hoveredIndex === null || hoveredIndex === bar.index
                                                    ? 1
                                                    : 0.45} />
                                        {:else}
                                            <rect
                                                x={bar.x}
                                                y={seg.y}
                                                width={bar.width}
                                                height={seg.height}
                                                fill={seg.color}
                                                opacity={hoveredIndex === null || hoveredIndex === bar.index
                                                    ? 1
                                                    : 0.45} />
                                        {/if}
                                    {/each}
                                {/each}

                                {#if hoveredBar}
                                    <line
                                        x1={hoveredBar.centerX}
                                        y1={PAD.top}
                                        x2={hoveredBar.centerX}
                                        y2={baselineY}
                                        stroke="var(--primary)"
                                        stroke-opacity="0.22"
                                        stroke-width="1"
                                        stroke-dasharray="4 3"
                                        vector-effect="non-scaling-stroke" />
                                {/if}
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            <div class="mt-1.5 flex h-4">
                <div class="w-11 shrink-0" aria-hidden="true"></div>
                <div class="relative min-w-0 flex-1">
                    {#each xTicks as tick (tick.index)}
                        <span
                            class="absolute text-[11px] text-neutral-400 {tick.align === 'start'
                                ? 'translate-x-0'
                                : tick.align === 'end'
                                  ? '-translate-x-full'
                                  : '-translate-x-1/2'}"
                            style="left: {tick.leftPct}%">
                            {tick.label}
                        </span>
                    {/each}
                </div>
            </div>
        {/if}
    </div>
</div>
