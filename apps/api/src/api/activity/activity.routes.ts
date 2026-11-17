import { Hono } from "hono";
import {
    findAllActivity,
    findActivityById,
    findActivityLogById,
    findActivityStatusById,
    getActivitySummary,
    retryActivity,
    cancelActivity,
} from "./activity.controller.js";

export const activityRouter = new Hono();

activityRouter.get("/summary", getActivitySummary);
activityRouter.get("/", findAllActivity);
activityRouter.get("/:id{\\d+}/log", findActivityLogById);
activityRouter.get("/:id{\\d+}/status", findActivityStatusById);
activityRouter.get("/:id{\\d+}", findActivityById);
activityRouter.post("/:id{\\d+}/retry", retryActivity);
activityRouter.post("/:id{\\d+}/cancel", cancelActivity);
