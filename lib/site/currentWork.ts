export type CurrentWorkItem = {
  name: string;
  status: string;
  description: string;
  focus: readonly string[];
  /** Destination of the project's case study; no link is rendered while unset. */
  href?: string;
};

export const currentWork: readonly CurrentWorkItem[] = [
  {
    name: "BillSync",
    status: "Currently being developed",
    description:
      "An AI-powered inventory management platform designed to turn business documents into verified, structured operational data.",
    focus: [
      "AI-powered document processing",
      "Human verification workflows",
      "Inventory management",
      "Multi-tenant architecture",
      "Backend systems and data integrity",
    ],
    href: "/work/billsync",
  },
];
