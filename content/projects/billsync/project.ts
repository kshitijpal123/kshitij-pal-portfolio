import type { ProjectDefinition } from "@/lib/content/projects";
import CaseStudy from "./index.mdx";

export const billsync: ProjectDefinition = {
  slug: "billsync",
  title: "BillSync",
  tagline: "AI-powered inventory management platform",
  summary:
    "An AI-powered inventory management platform designed to turn business documents into verified, structured operational data.",
  lede: "AI-powered inventory management built around document ingestion, structured extraction, human verification, and reliable operational data.",
  status: "Currently being developed",
  type: "Personal project",
  technologies: [
    "AI document processing",
    "Human verification workflows",
    "Inventory management",
    "Multi-tenant architecture",
    "PostgreSQL",
    "RabbitMQ",
    "Redis",
    "Docker",
  ],
  focus: [
    "AI document processing",
    "Inventory",
    "Multi-tenancy",
    "Backend systems",
  ],
  problem:
    "Supplier purchase bills carry the information inventory depends on, but a document is not structured data, and a machine's reading of it is not yet something a business can trust.",
  solution:
    "A pipeline that keeps the original document, the AI extraction, and human-verified business data as separate stages, so only reviewed data updates inventory and every step leaves history.",
  metaTitle: "BillSync · AI-Powered Inventory Engineering Case Study",
  featured: true,
  CaseStudy,
};
