export type TechnologyGroup = {
  label: string;
  items: readonly string[];
};

export type ExperienceEntry = {
  company: string;
  role: string;
  location: string;
  /** Only set from verified dates; the period is not rendered while unset. */
  period?: string;
  summary: string;
  responsibilities: readonly string[];
  /** The role's broader engineering environment, not a per-project claim. */
  technologies: readonly TechnologyGroup[];
};

/** Most recent role first. */
export const experience: readonly ExperienceEntry[] = [
  {
    company: "Digicorp Information Systems",
    role: "Backend Developer",
    location: "Ahmedabad, India",
    summary:
      "Worked on production-oriented backend systems using Node.js and Express.js, building APIs, integrating databases and services, and contributing to cloud-based application delivery.",
    responsibilities: [
      "Built and maintained backend APIs using Node.js and Express.js.",
      "Worked with relational and NoSQL databases across different application requirements.",
      "Contributed to service-oriented and microservice-based backend systems.",
      "Implemented integrations and asynchronous processing using messaging and caching infrastructure where required.",
      "Worked with Azure-based application deployment and CI/CD workflows.",
      "Collaborated with frontend and other engineering components to deliver end-to-end application functionality.",
      "Used API documentation and development tooling such as Swagger/OpenAPI, Git, Jira, and Azure DevOps.",
    ],
    technologies: [
      {
        label: "Backend",
        items: ["Node.js", "Express.js", "TypeScript", "REST APIs"],
      },
      {
        label: "Databases",
        items: ["PostgreSQL", "MySQL", "MongoDB", "Microsoft SQL Server"],
      },
      {
        label: "Infrastructure",
        items: ["Azure", "Azure Web Apps", "AWS", "Docker", "CI/CD"],
      },
      {
        label: "Systems",
        items: ["Redis", "RabbitMQ", "Microservices", "Cron jobs"],
      },
      {
        label: "Tooling",
        items: [
          "Git",
          "Jira",
          "Azure DevOps",
          "Azure Pipelines",
          "Swagger/OpenAPI",
        ],
      },
      {
        label: "Additional exposure",
        items: ["Angular", "EJS"],
      },
    ],
  },
];
