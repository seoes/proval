import { getDocsIndex, getDocTree } from "../../lib/content/loader.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = () => {
    return {
        docs: getDocTree(),
        index: getDocsIndex() ?? null,
    };
};
