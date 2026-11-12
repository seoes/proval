import { resolve } from "node:path";

export interface ModelCost {
    input: number;
    output: number;
    cachedInput?: number;
}

export interface ModelLimit {
    context: number;
    output: number;
    input?: number;
}

export interface ModelMetadata {
    id: string;
    name: string;
    cost: ModelCost;
    limit: ModelLimit;
    reasoningEffort?: string[];
}

export class CatalogService {
    private modelList: ModelMetadata[] | undefined;

    private async loadModelList(): Promise<ModelMetadata[]> {
        if (this.modelList !== undefined) {
            return this.modelList;
        }
        const file = Bun.file(resolve(import.meta.dir, "models.json"));
        if (!(await file.exists())) {
            this.modelList = [];
            return this.modelList;
        }
        try {
            const parsed: unknown = await file.json();
            if (!Array.isArray(parsed)) {
                this.modelList = [];
                return this.modelList;
            }
            this.modelList = parsed as ModelMetadata[];
            return this.modelList;
        } catch {
            this.modelList = [];
            return this.modelList;
        }
    }
    public async matchModel(modelId: string): Promise<ModelMetadata | undefined> {
        await this.loadModelList();
        return this.modelList?.find((model) => model.id === modelId);
    }
    public async calculateModelCost(
        modelId: string,
        inputToken: number,
        cachedInputToken: number,
        outputToken: number,
    ): Promise<number | undefined> {
        const model = await this.matchModel(modelId);
        if (!model) {
            return undefined;
        }
        const nonCachedInput = Math.max(0, inputToken - cachedInputToken);
        const cachedRate = model.cost.cachedInput ?? model.cost.input;
        return (
            (nonCachedInput * model.cost.input) / 1e6 +
            (cachedInputToken * cachedRate) / 1e6 +
            (outputToken * model.cost.output) / 1e6
        );
    }
}
