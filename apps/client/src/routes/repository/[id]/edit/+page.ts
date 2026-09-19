import type { PageLoad } from "./$types";
import { loadRepositoryPage } from "../load.js";

export const ssr = false;

export const load: PageLoad = async ({ params }) => {
    return loadRepositoryPage(params.id);
};
