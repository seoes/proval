import { formatLocalDateOnly, formatLocalDateTime } from "./utils/date.js";

export type FormatTimeAgoOptions = {
    /** Relative labels switch to local datetime once age reaches this many minutes. */
    absoluteAfterMinutes?: number;
};

const fetchApi = async (path: string, options: RequestInit = {}) => {
    if (__PROVAL_DEMO_BUILD__) {
        const { demoFetch } = await import("./demo/fetch.js");
        return demoFetch(path, options);
    }
    const response = await fetch(`/api${path}`, {
        ...options,
        credentials: "include",
    });
    return response;
};

export default fetchApi;

export const formatTimeAgo = (date: Date, options?: FormatTimeAgoOptions): string => {
    const now = new Date();
    const target = new Date(date);
    const diffMs = now.getTime() - target.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    const absoluteAfterMinutes = options?.absoluteAfterMinutes;
    if (absoluteAfterMinutes != null && diffMinutes >= absoluteAfterMinutes) {
        return formatLocalDateTime(target);
    }

    if (diffSeconds < 60) {
        return `${diffSeconds} seconds ago`;
    } else if (diffMinutes < 60) {
        return `${diffMinutes} min ago`;
    } else if (diffHours < 24) {
        return `${diffHours} hours ago`;
    } else if (diffDays <= 7) {
        return `${diffDays} days ago`;
    } else {
        return formatLocalDateOnly(target);
    }
};

export const formatDuration = (start: Date, end: Date): string => {
    const diffMs = new Date(end).getTime() - new Date(start).getTime();
    if (diffMs < 0) return "—";

    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);

    if (diffSeconds < 60) {
        return `${diffSeconds} sec`;
    }
    if (diffMinutes < 60) {
        return `${diffMinutes} min`;
    }
    const hours = diffHours;
    const mins = diffMinutes % 60;
    if (mins === 0) {
        return `${hours} hr`;
    }
    return `${hours} hr ${mins} min`;
};
