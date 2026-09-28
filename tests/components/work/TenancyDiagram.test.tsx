import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TenancyDiagram } from "@/components/work/TenancyDiagram";

describe("TenancyDiagram", () => {
  it("nests each tenant and its roles inside the platform", () => {
    const { container } = render(
      <TenancyDiagram
        caption="Tenants"
        platform="Platform"
        platformRole="SUPER_ADMIN"
        tenants={[
          { name: "Business A", roles: ["ADMIN", "STAFF"] },
          { name: "Business B", roles: ["ADMIN", "STAFF"] },
        ]}
      />,
    );

    expect(within(container).getByText("Tenants").tagName).toBe("FIGCAPTION");
    const platform = container.querySelector("figure > ul > li") as HTMLElement;
    expect(platform).toHaveTextContent(/^PlatformSUPER_ADMIN/);
    expect(
      within(screen.getByRole("list", { name: "Business B roles" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["ADMIN", "STAFF"]);
  });
});
