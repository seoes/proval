/**
 * Three output modes, because three different readers use this tool.
 *
 * table  a person at a terminal
 * json   a script, which wants one parseable document
 * agent  an agent, which wants one object per line it can consume as it arrives
 */
export type OutputMode = "table" | "json" | "agent";

export interface Column<T> {
    header: string;
    value: (row: T) => string;
    /** Right aligns the column, for counts and sizes where the digits should line up. */
    numeric?: boolean;
}

export function formatValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? "yes" : "no";
    if (value instanceof Date) return value.toISOString();
    return String(value);
}

/**
 * Renders fixed width columns. Width is measured per column across the header
 * and every cell, so nothing is truncated: a path that does not fit is worth
 * more than a tidy table.
 */
export function renderTable<T>(rowList: T[], columnList: Column<T>[]): string {
    if (rowList.length === 0) {
        return "";
    }
    const cellMatrix = rowList.map((row) => columnList.map((column) => column.value(row)));
    const widthList = columnList.map((column, index) =>
        Math.max(column.header.length, ...cellMatrix.map((cells) => cells[index]!.length)),
    );

    const pad = (text: string, width: number, numeric: boolean) =>
        numeric ? text.padStart(width) : text.padEnd(width);

    const lineList: string[] = [];
    lineList.push(
        columnList.map((column, index) => pad(column.header, widthList[index]!, false)).join("  ").trimEnd(),
    );
    for (const cells of cellMatrix) {
        lineList.push(
            cells
                .map((cell, index) => pad(cell, widthList[index]!, columnList[index]!.numeric ?? false))
                .join("  ")
                .trimEnd(),
        );
    }
    return lineList.join("\n");
}

/** One JSON object per line, so a consumer can read results as they arrive. */
export function renderNdjson(rowList: unknown[]): string {
    return rowList.map((row) => JSON.stringify(row)).join("\n");
}

export function render<T>(mode: OutputMode, rowList: T[], columnList: Column<T>[]): string {
    if (mode === "json") return JSON.stringify(rowList, null, 2);
    if (mode === "agent") return renderNdjson(rowList);
    return renderTable(rowList, columnList);
}

/** A single object rather than a list, for a show or a create. */
export function renderOne<T extends object>(mode: OutputMode, row: T): string {
    if (mode === "json") return JSON.stringify(row, null, 2);
    if (mode === "agent") return JSON.stringify(row);
    return Object.entries(row)
        .map(([key, value]) => `${key}: ${formatValue(value)}`)
        .join("\n");
}
