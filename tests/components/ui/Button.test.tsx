import { fireEvent, render, screen } from "@testing-library/react";
import NextLink from "next/link";
import { describe, expect, it, vi } from "vitest";
import { Button, buttonClassName } from "@/components/ui/Button";

describe("Button", () => {
  it("renders a native button that defaults to type=button", () => {
    render(<Button>Save</Button>);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
  });

  it("keeps an explicit submit type", () => {
    render(<Button type="submit">Send</Button>);

    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });

  it("defaults to the primary variant", () => {
    render(<Button>Primary</Button>);

    expect(screen.getByRole("button")).toHaveClass(
      "bg-accent",
      "text-accent-foreground",
    );
  });

  it.each([
    ["primary", ["bg-accent", "hover:bg-accent-hover"]],
    ["secondary", ["border-border-strong", "bg-surface", "hover:bg-muted"]],
    ["ghost", ["text-muted-foreground", "hover:bg-muted"]],
  ] as const)("applies the %s variant", (variant, classes) => {
    render(<Button variant={variant}>Action</Button>);

    expect(screen.getByRole("button")).toHaveClass(...classes);
  });

  it("uses the control radius and a 44px minimum height", () => {
    render(<Button>Action</Button>);

    expect(screen.getByRole("button")).toHaveClass(
      "rounded-control",
      "min-h-11",
    );
  });

  it("appends a custom className", () => {
    render(<Button className="mt-4">Action</Button>);

    expect(screen.getByRole("button")).toHaveClass("mt-4", "bg-accent");
  });

  it("handles clicks and receives keyboard focus", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Action</Button>);

    const button = screen.getByRole("button");
    button.focus();
    expect(button).toHaveFocus();

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire or take focus when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Action
      </Button>,
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();

    button.focus();
    expect(button).not.toHaveFocus();

    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("buttonClassName", () => {
  it("lets a link take button styling without becoming a button", () => {
    render(
      <NextLink href="/work" className={buttonClassName("secondary")}>
        View work
      </NextLink>,
    );

    const link = screen.getByRole("link", { name: "View work" });
    expect(link).toHaveClass("rounded-control", "border-border-strong");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
