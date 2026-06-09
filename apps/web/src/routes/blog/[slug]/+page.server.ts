import { error } from "@sveltejs/kit";
import { getBlogPost } from "../../../lib/content/loader.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ params }) => {
    const post = getBlogPost(params.slug);
    if (!post) {
        error(404, "Post not found");
    }
    return { post };
};
