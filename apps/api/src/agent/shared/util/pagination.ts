import type { Pagination } from "@proval/types";

export function slicePage<T>(items: T[], page: number, limit: number): Pagination<T> {
    const total = items.length;
    const start = (page - 1) * limit;
    const itemList = items.slice(start, start + limit);
    return { itemList, page, limit, total };
}

export function parseListToolPagination(args: Record<string, unknown>): { page: number; limit: number } {
    const page = Number(args.page);
    const limit = Number(args.limit);
    if (!Number.isFinite(page) || page < 1) {
        throw new Error("page must be a positive number");
    }
    if (!Number.isFinite(limit) || limit < 1) {
        throw new Error("limit must be a positive number");
    }
    return { page, limit };
}
