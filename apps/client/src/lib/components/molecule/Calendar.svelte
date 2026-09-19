<script lang="ts">
    import { twMerge } from "tailwind-merge";
    import { dateOnlyToLocalDate, formatLocalDateOnly } from "$lib/utils/date.js";

    type DayCell = {
        dateOnly: string;
        day: number;
        inMonth: boolean;
    };

    type Props = {
        from?: string;
        to?: string;
        onRangeChange?: (from: string, to: string) => void;
        class?: string;
    };

    let { from = "", to = "", onRangeChange, class: className }: Props = $props();

    const weekdayLabelList = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    let visibleYear = $state(new Date().getFullYear());
    let visibleMonth = $state(new Date().getMonth());
    let rangeAnchor = $state<string | null>(null);

    const todayDateOnly = $derived(formatLocalDateOnly(new Date()));

    const monthTitle = $derived(
        new Date(visibleYear, visibleMonth, 1).toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
        }),
    );

    const dayCellList = $derived.by((): DayCell[] => {
        const firstOfMonth = new Date(visibleYear, visibleMonth, 1);
        const leadingEmpty = firstOfMonth.getDay();
        const daysInMonth = new Date(visibleYear, visibleMonth + 1, 0).getDate();
        const cellList: DayCell[] = [];

        const pushDate = (date: Date, inMonth: boolean) => {
            cellList.push({
                dateOnly: formatLocalDateOnly(date),
                day: date.getDate(),
                inMonth,
            });
        };

        for (let index = 0; index < leadingEmpty; index += 1) {
            pushDate(new Date(visibleYear, visibleMonth, -leadingEmpty + index + 1), false);
        }
        for (let day = 1; day <= daysInMonth; day += 1) {
            pushDate(new Date(visibleYear, visibleMonth, day), true);
        }
        while (cellList.length % 7 !== 0) {
            const last = cellList[cellList.length - 1];
            const parsed = dateOnlyToLocalDate(last.dateOnly);
            if (!parsed) break;
            pushDate(new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate() + 1), false);
        }
        return cellList;
    });

    $effect(() => {
        const seed = from || to;
        if (!seed) return;
        const parsed = dateOnlyToLocalDate(seed);
        if (!parsed) return;
        visibleYear = parsed.getFullYear();
        visibleMonth = parsed.getMonth();
    });

    function rangeStartEnd(): { start: string; end: string } | null {
        if (rangeAnchor) return { start: rangeAnchor, end: rangeAnchor };
        if (from && to) {
            return from <= to ? { start: from, end: to } : { start: to, end: from };
        }
        if (from) return { start: from, end: from };
        if (to) return { start: to, end: to };
        return null;
    }

    function cellRangeHighlight(cell: DayCell): { inRange: boolean; isEndpoint: boolean } {
        const bound = rangeStartEnd();
        if (!bound) return { inRange: false, isEndpoint: false };
        const inRange = cell.dateOnly >= bound.start && cell.dateOnly <= bound.end;
        const isEndpoint = cell.dateOnly === bound.start || cell.dateOnly === bound.end;
        return { inRange, isEndpoint };
    }

    function dayButtonClass(cell: DayCell): string {
        const { inRange, isEndpoint } = cellRangeHighlight(cell);
        const isToday = cell.dateOnly === todayDateOnly;
        const weekday = dateOnlyToLocalDate(cell.dateOnly)?.getDay() ?? 0;
        let weekendText = "";
        if (!isEndpoint) {
            if (weekday === 0) weekendText = cell.inMonth ? "text-red-500/75" : "text-red-400/60";
            if (weekday === 6) weekendText = cell.inMonth ? "text-blue-500/75" : "text-blue-400/60";
        }

        return twMerge(
            "relative flex h-9 w-9 cursor-pointer items-center justify-center text-sm transition-colors",
            !cell.inMonth && !weekendText && "text-neutral-400",
            cell.inMonth && !isEndpoint && !inRange && !weekendText && "text-neutral-800",
            weekendText,
            inRange && !isEndpoint && "bg-primary/10",
            inRange && !isEndpoint && !weekendText && "text-neutral-900",
            isEndpoint && "rounded-lg bg-primary font-medium text-primary-foreground",
            isToday && !isEndpoint && !weekendText && "font-semibold text-primary",
            !isEndpoint && !inRange && "rounded-lg hover:bg-neutral-100",
        );
    }

    function onDayClick(dateOnly: string) {
        if (rangeAnchor === null) {
            rangeAnchor = dateOnly;
            return;
        }
        const start = rangeAnchor <= dateOnly ? rangeAnchor : dateOnly;
        const end = rangeAnchor <= dateOnly ? dateOnly : rangeAnchor;
        rangeAnchor = null;
        onRangeChange?.(start, end);
    }
</script>

<div
    class={twMerge(
        "w-[19rem] rounded-lg border border-neutral-200 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-white",
        className,
    )}
    role="application"
    aria-label="Calendar">
    <div class="mb-3 flex items-center justify-between gap-2">
        <button
            type="button"
            class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100"
            aria-label="Previous month"
            onclick={() => {
                if (visibleMonth === 0) {
                    visibleMonth = 11;
                    visibleYear -= 1;
                } else {
                    visibleMonth -= 1;
                }
            }}>
            <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                    fill-rule="evenodd"
                    d="M12.79 5.23a.75.75 0 011.06.02L10 11.17l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                    clip-rule="evenodd" />
            </svg>
        </button>
        <p class="text-sm font-medium text-neutral-900">{monthTitle}</p>
        <button
            type="button"
            class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100"
            aria-label="Next month"
            onclick={() => {
                if (visibleMonth === 11) {
                    visibleMonth = 0;
                    visibleYear += 1;
                } else {
                    visibleMonth += 1;
                }
            }}>
            <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                    fill-rule="evenodd"
                    d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.25 4.5a.75.75 0 010 1.08l-4.25 4.25a.75.75 0 01-1.06-.02z"
                    clip-rule="evenodd" />
            </svg>
        </button>
    </div>

    <div class="mb-1 grid grid-cols-7 gap-0.5">
        {#each weekdayLabelList as label, index (label)}
            <div
                class={twMerge(
                    "flex h-8 items-center justify-center text-xs font-medium",
                    index === 0 && "text-red-500/80",
                    index === 6 && "text-blue-500/80",
                    index !== 0 && index !== 6 && "text-neutral-500",
                )}>
                {label}
            </div>
        {/each}
    </div>

    <div class="grid grid-cols-7 gap-0.5">
        {#each dayCellList as cell (cell.dateOnly + String(visibleMonth) + String(visibleYear))}
            {@const highlight = cellRangeHighlight(cell)}
            <div class="flex items-center justify-center">
                <button
                    type="button"
                    class={dayButtonClass(cell)}
                    aria-label={cell.dateOnly}
                    aria-pressed={highlight.inRange}
                    onclick={() => onDayClick(cell.dateOnly)}>
                    {cell.day}
                </button>
            </div>
        {/each}
    </div>

    <p class="mt-3 text-xs text-neutral-500">Click a start date, then an end date.</p>
</div>
