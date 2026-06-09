import matter from "gray-matter";
import { marked } from "marked";
import type { BlogPost, BlogPostMeta, DocMeta, DocPage } from "./types";

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

function parseMarkdown(content: string): string {
    return marked.parse(content, { async: false });
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
    return {
        slug,
        title: String(data.title ?? slug),
        description: String(data.description ?? ""),
        order: Number(data.order ?? 999),
        html: parseMarkdown(content),
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
        .map(({ slug, title, description, order }) => ({ slug, title, description, order }))
        .sort((a, b) => a.order - b.order);
}

export function getDoc(slug: string): DocPage | undefined {
    return docPages.find((doc) => doc.slug === slug);
}

export function getDocsIndex(): DocPage | undefined {
    return docPages.find((doc) => doc.slug === "index");
}
