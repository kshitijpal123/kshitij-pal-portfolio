import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import ProjectPage, {
  dynamicParams,
  generateMetadata,
  generateStaticParams,
} from "@/app/work/[slug]/page";
import { installIntersectionObserver } from "@/tests/helpers/intersectionObserver";

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("next/navigation", () => ({ notFound }));

beforeAll(() => {
  installIntersectionObserver();
});

function props(slug: string) {
  return {
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve({}),
  };
}

async function renderBillSync() {
  render(await ProjectPage(props("billsync")));
}

function section(name: string) {
  return within(screen.getByRole("region", { name }));
}

/** jsdom does not name a figure from its figcaption; browsers do. */
function figure(scope: ReturnType<typeof section>, caption: string) {
  const figcaption = scope.getByText(caption, { selector: "figcaption" });
  return figcaption.closest("figure") as HTMLElement;
}

// The whole case study renders in every test; role queries over it are slow.
describe("ProjectPage (BillSync)", { timeout: 20_000 }, () => {
  it("renders BillSync as the only h1, with every section as an h2", async () => {
    await renderBillSync();

    const h1 = document.querySelectorAll("h1");
    expect(h1).toHaveLength(1);
    expect(h1[0]).toHaveTextContent("BillSync");
    expect(
      Array.from(document.querySelectorAll("h2"), (h) => h.textContent),
    ).toEqual([
      "The problem",
      "The core idea",
      "System workflow",
      "Architecture",
      "Asynchronous processing",
      "AI document processing",
      "Data model",
      "Multi-tenancy",
      "Data integrity and auditability",
      "Development foundation",
      "Engineering Decisions",
      "Current Status",
      "What's next",
    ]);
  });

  it("renders the hero status, focus, problem, and solution", async () => {
    await renderBillSync();

    const hero = section("BillSync");
    expect(
      hero.getByText("Personal project · Currently being developed"),
    ).toBeInTheDocument();
    expect(hero.getByRole("list", { name: "Focus" })).toHaveTextContent(
      /AI document processing.*Inventory.*Multi-tenancy.*Backend systems/,
    );
    expect(hero.getByText("Problem")).toBeInTheDocument();
    expect(hero.getByText("Solution")).toBeInTheDocument();
  });

  it("renders the seven-stage core workflow in order", async () => {
    await renderBillSync();

    const workflow = figure(section("System workflow"), "Core workflow");
    const steps = within(workflow)
      .getAllByRole("listitem")
      .map((item) => item.querySelector("span.uppercase")?.textContent);
    expect(steps).toEqual([
      "Upload",
      "Process",
      "Extract",
      "Review",
      "Verify",
      "Update",
      "Audit",
    ]);
  });

  it("renders the development architecture with its components", async () => {
    await renderBillSync();

    const diagram = figure(section("Architecture"), "System architecture");
    expect(diagram).toHaveTextContent("Development architecture");
    for (const text of [
      "API / Upload",
      "RabbitMQ",
      "Worker",
      "Human verification",
      "Verified business data",
      "PostgreSQL",
      "Redis",
      "Object storage",
    ]) {
      expect(diagram).toHaveTextContent(text);
    }
    expect(diagram.querySelectorAll("svg[aria-hidden='true']")).toHaveLength(7);
  });

  it("explains the multi-tenancy model", async () => {
    await renderBillSync();

    const tenancy = section("Multi-tenancy");
    expect(figure(tenancy, "Tenant structure")).toHaveTextContent(
      "SUPER_ADMIN",
    );
    expect(
      tenancy.getAllByRole("list", { name: /Business [ABC] roles/ }),
    ).toHaveLength(3);
    expect(
      tenancy.getByText(/are not given access to any other business/),
    ).toBeInTheDocument();
  });

  it("renders all eleven tables in the data model", async () => {
    await renderBillSync();

    const model = section("Data model");
    expect(
      model.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual([
      "Business and identity",
      "Document",
      "Extraction",
      "Inventory",
      "Audit",
    ]);
    expect(model.getAllByRole("term").map((term) => term.textContent)).toEqual([
      "businesses",
      "users",
      "bills",
      "bill_items",
      "extraction_attempts",
      "extraction_snapshots",
      "corrections",
      "products",
      "batches",
      "inventory_movements",
      "audit_events",
    ]);
  });

  it("renders the engineering decisions, each with a rationale", async () => {
    await renderBillSync();

    const decisions = section("Engineering Decisions");
    const headings = decisions.getAllByRole("heading", { level: 3 });
    expect(headings).toHaveLength(7);
    expect(headings[0]).toHaveTextContent(
      "AI extraction is not authoritative business data.",
    );
    expect(decisions.getAllByText("Why")).toHaveLength(7);
  });

  it("separates established work, current direction, and planned next", async () => {
    await renderBillSync();

    const status = section("Current Status");
    expect(
      status.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["Established", "Current direction", "Planned next"]);
    expect(
      section("What's next").getByText(/The next phase is/),
    ).toBeInTheDocument();
  });

  it("links back to Work and to Contact in a named navigation landmark", async () => {
    await renderBillSync();

    const nav = within(screen.getByRole("navigation", { name: "Case study" }));
    expect(nav.getByRole("link", { name: "Back to Work" })).toHaveAttribute(
      "href",
      "/work",
    );
    expect(nav.getByRole("link", { name: "Let's connect" })).toHaveAttribute(
      "href",
      "/contact",
    );
  });

  it("makes no metric, launch, customer, or production-readiness claims", async () => {
    await renderBillSync();

    const text = screen.getByRole("article").textContent;
    expect(text).not.toMatch(
      /production-ready|launched|customers?|revenue|uptime|accuracy|latency|throughput|\d+\s?%/i,
    );
  });
});

describe("ProjectPage routing", () => {
  it("prerenders only known projects", () => {
    expect(generateStaticParams()).toEqual([{ slug: "billsync" }]);
    expect(dynamicParams).toBe(false);
  });

  it("calls notFound for an unknown slug", async () => {
    await expect(ProjectPage(props("unknown"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });

  it("defines the case-study title and description", async () => {
    const metadata = await generateMetadata(props("billsync"));
    expect(metadata.title).toBe(
      "BillSync · AI-Powered Inventory Engineering Case Study",
    );
    expect(metadata.description).toEqual(expect.any(String));
  });
});
