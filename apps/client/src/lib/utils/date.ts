/** Activity list `from` / `to` query params are local calendar dates (YYYY-MM-DD). `to` is exclusive at next-day 00:00. */

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDateOnly(value: string | null | undefined): string | null {
    const trimmed = value?.trim() ?? "";
    if (!trimmed || !DATE_ONLY_PATTERN.test(trimmed)) return null;
    const date = new Date(`${trimmed}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    return trimmed;
}

export function parseDateOnlyQuery(value: string | null | undefined): string {
    return normalizeDateOnly(value) ?? "";
}

export function dateOnlyToLocalDate(dateOnly: string): Date | null {
    const normalized = normalizeDateOnly(dateOnly);
    if (!normalized) return null;
    return new Date(`${normalized}T00:00:00`);
}

export function parseDateOnlyEndExclusiveLocal(dateOnly: string): Date | null {
    const start = dateOnlyToLocalDate(dateOnly);
    if (!start) return null;
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return end;
}

export function formatDateOnlyLabel(dateOnly: string, options?: Intl.DateTimeFormatOptions): string {
    const date = dateOnlyToLocalDate(dateOnly);
    if (!date) return dateOnly;
    return date.toLocaleDateString(undefined, options ?? { month: "short", day: "numeric", year: "numeric" });
}

export function formatLocalDateOnly(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}
