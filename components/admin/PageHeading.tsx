import type { ReactNode } from "react";

/** The h1 of a console page with an optional introduction. */
export function PageHeading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div>
      <h1 className="text-h2">{title}</h1>
      {children && (
        <div className="mt-3 max-w-measure text-body text-muted-foreground">
          {children}
        </div>
      )}
    </div>
  );
}
