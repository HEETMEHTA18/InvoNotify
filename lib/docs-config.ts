export type DocsRouteMode = "path" | "subdomain";

export type DocPageMeta = {
  slug: string;
  title: string;
  description: string;
  sourcePath: string;
  category: string;
  summary: string;
};

export const docPages: DocPageMeta[] = [
  {
    slug: "getting-started",
    title: "Getting Started",
    description:
      "Project overview, environment variables, setup, deployment, and operational guidance.",
    sourcePath: "README.md",
    category: "Start Here",
    summary:
      "Use this first for installation, environment setup, and the main system overview.",
  },
  {
    slug: "architecture",
    title: "Architecture",
    description:
      "Narrative architecture covering frontend, backend, data model, and optimization guidance.",
    sourcePath: "Documentation/architecture/system-architecture.md",
    category: "Core Reference",
    summary:
      "Explains how the application is structured and how data moves through the system.",
  },
  {
    slug: "workflows",
    title: "Workflows",
    description:
      "System context, request flows, dashboard analytics, auth, and deployment diagrams.",
    sourcePath: "Documentation/architecture/system-architecture-diagrams.md",
    category: "Core Reference",
    summary:
      "Diagram-focused documentation for onboarding, reviews, and operational understanding.",
  },
  {
    slug: "srs",
    title: "Software Requirements Spec",
    description:
      "Formal SRS for product scope, actors, features, interfaces, and non-functional requirements.",
    sourcePath: "Documentation/SRS.md",
    category: "Formal Docs",
    summary:
      "The project requirements specification used for academic and product documentation.",
  },
  {
    slug: "ai-recovery-prd",
    title: "AI Recovery PRD",
    description:
      "Prioritized Razorpay AI Revenue Recovery product requirements, module coverage, safety boundaries, and demo runbook.",
    sourcePath: "PRD.md",
    category: "Buildathon",
    summary:
      "Use this to understand the P0 recovery MVP, module status, demo account, and judging checklist.",
  },
  {
    slug: "ai-recovery-todo",
    title: "AI Recovery TODO",
    description:
      "Prioritized implementation checklist for the recovery modules and submission readiness.",
    sourcePath: "docs/RAZORPAY_HACKATHON_TODO.md",
    category: "Buildathon",
    summary:
      "Tracks complete P0 work, the next buildathon modules, and production hardening work.",
  },
];

export const docsSidebarSections = [
  {
    title: "Overview",
    items: [
      {
        title: "Documentation Home",
        slug: "",
      },
    ],
  },
  {
    title: "Documentation",
    items: docPages.map((page) => ({
      title: page.title,
      slug: page.slug,
    })),
  },
];

export function getDocPage(slug: string) {
  return docPages.find((page) => page.slug === slug);
}

export function getDocIndex(slug: string) {
  return docPages.findIndex((page) => page.slug === slug);
}

export function getDocsPath(
  slug = "",
  routeMode: DocsRouteMode = "path"
) {
  const normalizedSlug = slug.replace(/^\/+/, "");

  if (routeMode === "subdomain") {
    return normalizedSlug ? `/${normalizedSlug}` : "/";
  }

  return normalizedSlug ? `/docs/${normalizedSlug}` : "/docs";
}

export function getPublicDocsHref(slug = "") {
  const normalizedSlug = slug.replace(/^\/+/, "");
  return getDocsPath(normalizedSlug, "path");
}

export function slugifyText(value: string) {
  return value
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}
