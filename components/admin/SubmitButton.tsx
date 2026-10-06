import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";

type SubmitButtonProps = {
  pending: boolean;
  pendingLabel: string;
  children: ReactNode;
};

/**
 * Stays focusable while pending (`aria-disabled`, not `disabled`); the form
 * ignores submissions until the pending action finishes.
 */
export function SubmitButton({
  pending,
  pendingLabel,
  children,
}: SubmitButtonProps) {
  return (
    <Button
      type="submit"
      aria-disabled={pending || undefined}
      className="w-full aria-disabled:cursor-progress aria-disabled:opacity-50 sm:w-auto"
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
