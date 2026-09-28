import { evaluate } from "@mdx-js/mdx";
import { render, screen } from "@testing-library/react";
import * as runtime from "react/jsx-runtime";
import { describe, expect, it } from "vitest";
import { useMDXComponents } from "@/mdx-components";

const source = `
## Section heading

### Subsection heading

A paragraph with \`inline code\` and a [link](/work/billsync).

- First item
- Second item

1. Step one
2. Step two

> A quoted line.

\`\`\`ts
const answer = 42;
  indented();
\`\`\`
`;

async function renderMdx() {
  const { default: Content } = await evaluate(source, {
    ...runtime,
    useMDXComponents,
  });
  render(<Content />);
}

describe("MDX components", () => {
  it("renders headings at their Markdown level", async () => {
    await renderMdx();

    expect(
      screen.getByRole("heading", { level: 2, name: "Section heading" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Subsection heading" }),
    ).toBeInTheDocument();
  });

  it("renders paragraphs, inline code, and links", async () => {
    await renderMdx();

    expect(screen.getByText(/A paragraph with/).tagName).toBe("P");
    expect(screen.getByText("inline code").tagName).toBe("CODE");
    expect(screen.getByRole("link", { name: "link" })).toHaveAttribute(
      "href",
      "/work/billsync",
    );
  });

  it("renders unordered and ordered lists", async () => {
    await renderMdx();

    const [unordered, ordered] = screen.getAllByRole("list");
    expect(unordered?.tagName).toBe("UL");
    expect(ordered?.tagName).toBe("OL");
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("renders blockquotes", async () => {
    await renderMdx();

    expect(
      screen.getByText("A quoted line.").closest("blockquote"),
    ).not.toBeNull();
  });

  it("renders code blocks as focusable, scrollable pre elements that keep whitespace", async () => {
    await renderMdx();

    const pre = document.querySelector("pre");
    expect(pre).toHaveAttribute("tabIndex", "0");
    expect(pre).toHaveClass("overflow-x-auto");
    const code = pre?.querySelector("code");
    expect(code).toHaveClass("language-ts");
    expect(code?.textContent).toBe("const answer = 42;\n  indented();\n");
  });
});
