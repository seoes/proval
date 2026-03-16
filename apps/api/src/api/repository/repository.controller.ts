import type { Handler } from "hono";
import { RepositoryService } from "./repository.service.js";
import type { RepositoryResponse } from "@code-review/types";

export const findAllRepositoryController: Handler = async (c) => {
    const repositoryService = new RepositoryService();
    const repositoryList = await repositoryService.findAll();
    const repositoryResponseList: RepositoryResponse[] = repositoryList.map((repository) =>
        repositoryService.toResponse(repository),
    );
    console.log(repositoryResponseList);
    return c.json(repositoryResponseList, 200);
};
