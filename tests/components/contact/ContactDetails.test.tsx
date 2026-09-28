import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ContactDetails } from "@/components/contact/ContactDetails";
import { siteConfig } from "@/lib/site/config";

const configuredContact = siteConfig.contact;

afterEach(() => {
  siteConfig.contact = configuredContact;
});

describe("ContactDetails", () => {
  it("has the real email address and phone number configured", () => {
    expect(siteConfig.contact).toEqual([
      {
        label: "Email",
        value: "kshitij180123@gmail.com",
        href: "mailto:kshitij180123@gmail.com",
      },
      {
        label: "Phone",
        value: "+91 8791243983",
        href: "tel:+918791243983",
      },
    ]);
  });

  it("renders every contact method as a link under a Direct heading", () => {
    render(<ContactDetails />);

    const region = screen.getByRole("region", { name: "Direct" });
    expect(
      within(region)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual(siteConfig.contact.map((method) => [method.value, method.href]));
  });

  it("renders nothing when no contact method is configured", () => {
    siteConfig.contact = [];
    const { container } = render(<ContactDetails />);

    expect(container).toBeEmptyDOMElement();
  });
});
