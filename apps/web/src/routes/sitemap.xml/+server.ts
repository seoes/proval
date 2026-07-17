import { SITE_URL } from "$lib/constants";
import { getBlogPosts, getDocTree } from "$lib/content/loader.server";

export const prerender = true;

function loc(path: string): string {
    return `${SITE_URL}${path === "/" ? "" : path}`;
}

function urlEntry(path: string, priority: string, lastmod?: string): string {
    const lastmodTag = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : "";
    return `  <url>
    <loc>${loc(path)}</loc>${lastmodTag}
    <priority>${priority}</priority>
  </url>`;
}

export function GET() {
    const docs = getDocTree();
    const posts = getBlogPosts();

    const entries = [
        urlEntry("/", "1.0"),
        urlEntry("/docs", "0.8"),
        ...docs.map((doc) => urlEntry(`/docs/${doc.slug}`, "0.8")),
        urlEntry("/blog", "0.5"),
        ...posts.map((post) => urlEntry(`/blog/${post.slug}`, "0.5", post.date || undefined)),
    ];

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</urlset>
`;

    return new Response(body, {
        headers: {
            "Content-Type": "application/xml",
        },
    });
}
