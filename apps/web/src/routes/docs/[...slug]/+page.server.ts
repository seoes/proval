import { error } from "@sveltejs/kit";
import { getDoc, getDocTree } from "../../../lib/content/loader.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ params }) => {
    const doc = getDoc(params.slug);
    if (!doc) {
        error(404, "Page not found");
    }
    return { doc, docTree: getDocTree() };
};
