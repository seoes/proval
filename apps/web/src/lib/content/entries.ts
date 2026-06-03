const blogPaths = import.meta.glob("../../content/blog/*.md", {
    query: "?url",
    import: "default",
});

const docPaths = import.meta.glob("../../content/docs/**/*.md", {
    query: "?url",
    import: "default",
});

function slugFromBlogPath(path: string): string | undefined {
    const match = path.match(/\/blog\/([^/]+)\.md$/);
    return match?.[1];
}

function slugFromDocPath(path: string): string | undefined {
    const match = path.match(/\/docs\/(.+)\.md$/);
    const slug = match?.[1];
    if (!slug || slug === "index") return undefined;
    return slug;
}

export function getBlogSlugEntries(): { slug: string }[] {
    return Object.keys(blogPaths)
        .map(slugFromBlogPath)
        .filter((slug): slug is string => Boolean(slug))
        .map((slug) => ({ slug }));
}

export function getDocSlugEntries(): { slug: string }[] {
    return Object.keys(docPaths)
        .map(slugFromDocPath)
        .filter((slug): slug is string => Boolean(slug))
        .map((slug) => ({ slug }));
}
