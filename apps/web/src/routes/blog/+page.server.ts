import { getBlogPosts } from "../../lib/content/loader.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = () => {
    return { posts: getBlogPosts() };
};
