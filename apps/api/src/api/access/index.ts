import { Hono } from "hono";
import {
    createAccess,
    deleteAccessById,
    getAccessById,
    getAccessList,
    getRepositoryListByAccessId,
    testAccess,
    updateAccessById,
    updateAccessTokenById,
} from "./access.controller";

export const accessRouter = new Hono();

accessRouter.get("/", getAccessList);
accessRouter.get("/:id", getAccessById);
accessRouter.get("/:id/repository", getRepositoryListByAccessId);
accessRouter.post("/", createAccess);
accessRouter.put("/:id", updateAccessById);
accessRouter.patch("/:id/access-token", updateAccessTokenById);
accessRouter.delete("/:id", deleteAccessById);
accessRouter.post("/:id/test", testAccess);
