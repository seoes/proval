/** Activity list `from` / `to` query params are local calendar dates (YYYY-MM-DD). `to` is exclusive at next-day 00:00. */

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDateOnly(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    if (!trimmed || !DATE_ONLY_PATTERN.test(trimmed)) return undefined;
    const date = new Date(`${trimmed}T00:00:00`);
    if (Number.isNaN(date.getTime())) return undefined;
    return trimmed;
}

export function parseDateOnlyStart(value: string | undefined): Date | undefined {
    const dateOnly = normalizeDateOnly(value);
    if (!dateOnly) return undefined;
    return new Date(`${dateOnly}T00:00:00`);
}

export function parseDateOnlyEndExclusive(value: string | undefined): Date | undefined {
    const dateOnly = normalizeDateOnly(value);
    if (!dateOnly) return undefined;
    const end = new Date(`${dateOnly}T00:00:00`);
    end.setDate(end.getDate() + 1);
    return end;
}
