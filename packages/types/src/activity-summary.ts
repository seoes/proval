import type { Activity } from "./database.js";

export type DashboardRange = "24h" | "7d" | "30d" | "mtd" | "year";

export type ActivityStats = {
    totalActivity: number;
    errors: number;
    reviews: number;
    replies: number;
};

/** @deprecated Use ActivityStats */
export type ActivityLast24HoursStats = ActivityStats;

export type TokenSeriesPoint = {
    bucketStart: string;
    tokens: number;
};

export type TokenBreakdownItem = {
    label: string;
    tokens: number;
};

export type ActivitySummaryResponse = {
    range: DashboardRange;
    stats: ActivityStats;
    recent: Activity[];
    tokenSeries: TokenSeriesPoint[];
    tokensByModel: TokenBreakdownItem[];
    tokensByRepository: TokenBreakdownItem[];
    inProgress: Activity[];
};
