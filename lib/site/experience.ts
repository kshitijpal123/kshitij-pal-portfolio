type Month =
  | "01"
  | "02"
  | "03"
  | "04"
  | "05"
  | "06"
  | "07"
  | "08"
  | "09"
  | "10"
  | "11"
  | "12";

/** A calendar month, `YYYY-MM`. */
export type YearMonth = `${number}-${Month}`;

export type ExperienceSection = {
  title: string;
  items: readonly string[];
};

export type ExperienceEntry = {
  /** Stable, kebab-case anchor on `/experience` (`/experience#<id>`). */
  id: string;
  company: string;
  /** Shorter company name for the Home journey. */
  shortName: string;
  role: string;
  employmentType: "Full-time";
  startDate: YearMonth;
  /** `null` while the role is current. */
  endDate: YearMonth | null;
  /** Omitted when no verified location exists. */
  location?: string;
  workMode: "Remote" | "On-site";
  summary: string;
  /** What the role changed in how the engineer works. */
  progression: {
    label: string;
    statement: string;
  };
  sections: readonly ExperienceSection[];
  /** Verified technologies only; empty when none are verified for the role. */
  technologies: readonly string[];
};

const entries: readonly ExperienceEntry[] = [
  {
    id: "10x-academy",
    company: "The 10x Academy",
    shortName: "10x Academy",
    role: "Full-Stack Developer Intern",
    employmentType: "Full-time",
    startDate: "2021-05",
    endDate: "2021-11",
    workMode: "Remote",
    summary:
      "Started the transition from structured learning into hands-on software development, building a foundation across frontend and backend development.",
    progression: {
      label: "Foundation",
      statement: "From learning software development to building applications.",
    },
    sections: [
      {
        title: "Focus",
        items: [
          "Full-stack foundations",
          "Backend fundamentals",
          "Frontend development",
          "Application development",
          "Software development workflow",
        ],
      },
    ],
    technologies: [],
  },
  {
    id: "digicorp",
    company: "Digicorp Information Systems Pvt. Ltd.",
    shortName: "Digicorp",
    role: "Backend Developer",
    employmentType: "Full-time",
    startDate: "2021-12",
    endDate: "2024-03",
    location: "Ahmedabad, Gujarat, India",
    workMode: "Remote",
    summary:
      "Worked on enterprise web applications, developing backend services and REST APIs across customer management, reporting, support, invoicing, and payment management systems.",
    progression: {
      label: "Backend Engineering",
      statement:
        "From building applications to building production backend systems.",
    },
    sections: [
      {
        title: "Backend Engineering",
        items: [
          "Developed REST APIs and microservices using Node.js for enterprise web applications.",
          "Implemented backend business logic, data processing, API integrations, and application workflows.",
          "Developed customer management, reporting, and support modules to support business operations.",
        ],
      },
      {
        title: "Payment & Business Systems",
        items: [
          "Developed payment management functionality, including payment processing and integration with a Kuwait-based payment gateway.",
          "Built invoicing and notification workflows to automate operational processes.",
          "Developed reporting capabilities to provide structured business and operational insights.",
        ],
      },
      {
        title: "Software Engineering",
        items: [
          "Worked across the application development lifecycle, from understanding requirements and implementing backend functionality to testing and production support.",
          "Followed Agile development practices and contributed to code reviews and maintaining code quality.",
        ],
      },
    ],
    technologies: [
      "Node.js",
      "REST APIs",
      "Microservices",
      "JavaScript",
      "SQL",
      "Payment Gateway Integration",
      "Git",
      "Agile",
      "Testing",
      "Code Reviews",
    ],
  },
  {
    id: "khaitan-co",
    company: "Khaitan & Co",
    shortName: "Khaitan & Co",
    role: "Backend Developer",
    employmentType: "Full-time",
    startDate: "2024-06",
    endDate: null,
    location: "Noida, Uttar Pradesh, India",
    workMode: "On-site",
    summary:
      "Working on enterprise backend systems across backend architecture, API development, database schema design, workflow engineering, analytics, performance optimization, CI/CD, Azure deployment, AI integrations, and automation.",
    progression: {
      label: "Architecture & Systems",
      statement:
        "From implementing backend systems to designing and evolving production architecture.",
    },
    sections: [
      {
        title: "Architecture & Backend Engineering",
        items: [
          "Defined the backend microservice architecture based on business and application requirements.",
          "Designed the database schema for development, including tables, columns, relationships, and supporting data structures.",
          "Developed REST APIs and backend services using Node.js and TypeScript.",
        ],
      },
      {
        title: "Enterprise Workflow Systems",
        items: [
          "Designed and developed the Timesheet Review & Approval system with multi-level approvals, RM/TL workflows, reviewer assignments, RBAC, and audit tracking.",
          "Translated complex business approval rules into reliable backend workflows and APIs.",
        ],
      },
      {
        title: "HR Analytics & Reporting",
        items: [
          "Built HR Analytics & Reporting services with dashboard aggregation, advanced filtering, utilization tracking, and operational reporting.",
          "Optimized complex MSSQL and Knex.js queries, reducing unnecessary database calls and improving performance.",
        ],
      },
      {
        title: "Cloud, CI/CD & Deployment",
        items: [
          "Created CI/CD pipelines for Dev, Test, and Live environments supporting controlled releases and deployments.",
          "Created and configured Azure Web Apps on Linux running Node.js 22 LTS for backend application hosting.",
        ],
      },
      {
        title: "AI & Automation",
        items: [
          "Integrated Azure AI, Airia, and n8n to introduce AI capabilities and automate business workflows.",
          "Identified opportunities to streamline repetitive processes through automation and AI-enabled integrations.",
        ],
      },
    ],
    technologies: [
      "Node.js",
      "TypeScript",
      "Microservices",
      "REST APIs",
      "MSSQL",
      "Knex.js",
      "RabbitMQ",
      "Redis",
      "Azure",
      "Azure AI",
      "n8n",
      "Airia",
      "JWT",
      "RBAC",
      "Swagger",
      "Git",
    ],
  },
];

/** Oldest first: the Home journey. */
export const experience: readonly ExperienceEntry[] = [...entries].sort(
  (a, b) => a.startDate.localeCompare(b.startDate),
);

/** Newest first: the `/experience` record. */
export const experienceNewestFirst: readonly ExperienceEntry[] = [
  ...experience,
].reverse();

/** Where the Home journey continues; areas of focus, not job titles. */
export const currentTrajectory: readonly string[] = [
  "Backend",
  "Cloud",
  "Distributed Systems",
];

export function isCurrentRole(entry: ExperienceEntry) {
  return entry.endDate === null;
}

export function experienceHref(entry: ExperienceEntry) {
  return `/experience#${entry.id}`;
}

const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function parseYearMonth(value: YearMonth) {
  const [year, month] = value.split("-").map(Number);
  return { year, month };
}

/**
 * "May 2021". Built by hand rather than with `Intl`, so output never depends
 * on locale or time zone.
 */
export function formatYearMonth(value: YearMonth) {
  const { year, month } = parseYearMonth(value);
  return `${monthNames[month - 1]} ${year}`;
}

/**
 * Whole months in a completed role, counting both the first and last month.
 * Current roles have no duration: pages are prerendered, so it would go stale.
 */
export function durationInMonths(start: YearMonth, end: YearMonth) {
  const from = parseYearMonth(start);
  const to = parseYearMonth(end);
  return (to.year - from.year) * 12 + (to.month - from.month) + 1;
}

function plural(count: number, unit: string) {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

/** "7 months", "2 years 4 months". */
export function formatDuration(months: number) {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years > 0 && plural(years, "year"), rest > 0 && plural(rest, "month")]
    .filter(Boolean)
    .join(" ");
}
