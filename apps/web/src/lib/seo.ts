import { GITHUB_URL, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./constants";

export function jsonLdString(data: unknown): string {
    return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function organizationLd() {
    return {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/apple-touch-icon.png`,
        sameAs: [GITHUB_URL],
    };
}

export function softwareApplicationLd() {
    return {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Self-hosted",
        description: SITE_DESCRIPTION,
        url: SITE_URL,
        offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
        },
    };
}

export function faqPageLd(faqs: readonly { question: string; answer: string }[]) {
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((faq) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: {
                "@type": "Answer",
                text: faq.answer,
            },
        })),
    };
}

export function articleLd(input: {
    title: string;
    description: string;
    path: string;
    datePublished: string;
}) {
    const url = `${SITE_URL}${input.path}`;
    return {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: input.title,
        description: input.description,
        datePublished: input.datePublished,
        url,
        mainEntityOfPage: url,
        author: {
            "@type": "Organization",
            name: SITE_NAME,
            url: SITE_URL,
        },
        publisher: {
            "@type": "Organization",
            name: SITE_NAME,
            url: SITE_URL,
            logo: {
                "@type": "ImageObject",
                url: `${SITE_URL}/apple-touch-icon.png`,
            },
        },
    };
}

export function techArticleLd(input: { title: string; description: string; path: string }) {
    const url = `${SITE_URL}${input.path}`;
    return {
        "@context": "https://schema.org",
        "@type": "TechArticle",
        headline: input.title,
        description: input.description,
        url,
        mainEntityOfPage: url,
        author: {
            "@type": "Organization",
            name: SITE_NAME,
            url: SITE_URL,
        },
        publisher: {
            "@type": "Organization",
            name: SITE_NAME,
            url: SITE_URL,
            logo: {
                "@type": "ImageObject",
                url: `${SITE_URL}/apple-touch-icon.png`,
            },
        },
    };
}

export function breadcrumbLd(items: readonly { name: string; path: string }[]) {
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.name,
            item: `${SITE_URL}${item.path === "/" ? "" : item.path}`,
        })),
    };
}

export function itemListLd(input: {
    name: string;
    description: string;
    path: string;
    itemList: readonly { name: string; path: string }[];
}) {
    const url = `${SITE_URL}${input.path}`;
    return {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: input.name,
        description: input.description,
        url,
        numberOfItems: input.itemList.length,
        itemListElement: input.itemList.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.name,
            url: `${SITE_URL}${item.path}`,
        })),
    };
}

export function comparisonPageLd(input: { name: string; description: string; path: string; competitor: string }) {
    const url = `${SITE_URL}${input.path}`;
    return {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: input.name,
        description: input.description,
        url,
        about: {
            "@type": "SoftwareApplication",
            name: SITE_NAME,
            applicationCategory: "DeveloperApplication",
            operatingSystem: "Self-hosted",
            url: SITE_URL,
        },
        mentions: {
            "@type": "SoftwareApplication",
            name: input.competitor,
            applicationCategory: "DeveloperApplication",
        },
    };
}
