export type BlogPostMeta = {
    slug: string;
    title: string;
    description: string;
    date: string;
};

export type BlogPost = BlogPostMeta & {
    html: string;
};

export type DocMeta = {
    slug: string;
    title: string;
    description: string;
    order: number;
};

export type DocPage = DocMeta & {
    html: string;
};
