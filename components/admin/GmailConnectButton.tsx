"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { SubmitButton } from "@/components/admin/SubmitButton";

/** Shows "Connecting…" while the action prepares the Google redirect. */
export function GmailConnectButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <SubmitButton pending={pending} pendingLabel="Connecting…">
      {children}
    </SubmitButton>
  );
}
