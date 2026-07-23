import matter from "gray-matter";
import { marked, type Tokens } from "marked";
import type { BlogPost, BlogPostMeta, DocHeading, DocMeta, DocPage } from "./types";

const blogModules = import.meta.glob("../../content/blog/*.md", {
    eager: true,
    query: "?raw",
    import: "default",
}) as Record<string, string>;

const docModules = import.meta.glob("../../content/docs/**/*.md", {
    eager: true,
    query: "?raw",
    import: "default",
}) as Record<string, string>;

marked.setOptions({ gfm: true, breaks: false });

function slugFromBlogPath(path: string): string {
    const match = path.match(/\/blog\/([^/]+)\.md$/);
    return match?.[1] ?? path;
}

function slugFromDocPath(path: string): string {
    const match = path.match(/\/docs\/(.+)\.md$/);
    return match?.[1] ?? path;
}

function slugifyHeading(text: string): string {
    return text
        .toLowerCase()
        .replace(/<[^>]+>/g, "")
        .replace(/&[a-z]+;/gi, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}

function parseMarkdown(content: string): string {
    return marked.parse(content, { async: false }) as string;
}

function parseDocMarkdown(content: string): { html: string; headingList: DocHeading[] } {
    const headingList: DocHeading[] = [];
    const usedIdList = new Set<string>();

    const renderer = new marked.Renderer();
    const defaultHeading = renderer.heading.bind(renderer);

    renderer.heading = function (token: Tokens.Heading) {
        if (token.depth !== 2 && token.depth !== 3) {
            return defaultHeading(token);
        }

        const text = token.text.replace(/<[^>]+>/g, "").trim();
        let id = slugifyHeading(text) || `heading-${headingList.length + 1}`;
        let suffix = 2;
        while (usedIdList.has(id)) {
            id = `${slugifyHeading(text)}-${suffix}`;
            suffix += 1;
        }
        usedIdList.add(id);
        headingList.push({ id, text, level: token.depth as 2 | 3 });

        const inner = this.parser.parseInline(token.tokens);
        return `<h${token.depth} id="${id}"><a href="#${id}" class="doc-anchor">${inner}</a></h${token.depth}>\n`;
    };

    const html = marked.parse(content, { async: false, renderer }) as string;
    return { html, headingList };
}

function formatBlogDate(value: unknown): string {
    if (!value) return "";
    if (value instanceof Date) {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, "0");
        const d = String(value.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }
    const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    return match?.[1] ?? String(value);
}

function parseBlogRaw(path: string, raw: string): BlogPost {
    const { data, content } = matter(raw);
    const slug = slugFromBlogPath(path);
    return {
        slug,
        title: String(data.title ?? slug),
        description: String(data.description ?? ""),
        date: formatBlogDate(data.date),
        html: parseMarkdown(content),
    };
}

function parseDocRaw(path: string, raw: string): DocPage {
    const { data, content } = matter(raw);
    const slug = slugFromDocPath(path);
    const { html, headingList } = parseDocMarkdown(content);
    return {
        slug,
        title: String(data.title ?? slug),
        description: String(data.description ?? ""),
        order: Number(data.order ?? 999),
        html,
        headingList,
    };
}

const blogPosts = Object.entries(blogModules).map(([path, raw]) => parseBlogRaw(path, raw));
const docPages = Object.entries(docModules).map(([path, raw]) => parseDocRaw(path, raw));

export function getBlogPosts(): BlogPostMeta[] {
    return [...blogPosts]
        .map(({ slug, title, description, date }) => ({ slug, title, description, date }))
        .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getBlogPost(slug: string): BlogPost | undefined {
    return blogPosts.find((post) => post.slug === slug);
}

export function getDocTree(): DocMeta[] {
    return [...docPages]
        .filter((doc) => doc.slug !== "index")
        .map(({ slug, title, description, order }) => ({
            slug,
            title,
            description,
            order,
        }))
        .sort((a, b) => a.order - b.order);
}

export function getDoc(slug: string): DocPage | undefined {
    return docPages.find((doc) => doc.slug === slug);
}

export function getDocsIndex(): DocPage | undefined {
    return docPages.find((doc) => doc.slug === "index");
}
