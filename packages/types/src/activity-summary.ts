import type { Activity } from "./database.js";

export type ActivityLast24HoursStats = {
    totalActivity: number;
    errors: number;
    reviews: number;
    replies: number;
};

export type ActivitySummaryResponse = {
    last24Hours: ActivityLast24HoursStats;
    inProgress: Activity[];
};
