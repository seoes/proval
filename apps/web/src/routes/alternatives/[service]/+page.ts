import { error } from "@sveltejs/kit";
import { COMPETITOR_LIST } from "../../../lib/alternative/competitorList";
import type { EntryGenerator, PageLoad } from "./$types";

export const entries: EntryGenerator = () => COMPETITOR_LIST.map((item) => ({ service: item.slug }));

export const load: PageLoad = ({ params }) => {
    const competitor = COMPETITOR_LIST.find((item) => item.slug === params.service);
    if (!competitor) {
        error(404, "Alternative not found");
    }
    return { competitor };
};
