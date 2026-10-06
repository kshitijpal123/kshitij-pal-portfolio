"use client";

import { useActionState, useState } from "react";
import { AdminField } from "@/components/admin/AdminField";
import { FormStatus } from "@/components/admin/FormStatus";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Button } from "@/components/ui/Button";
import { createInvitationAction } from "@/lib/admin/actions";
import { idleFormState } from "@/lib/admin/formState";
import { adminLimits } from "@/lib/admin/validation";

/**
 * Invitation emails are not sent yet, so the link is shown once, here, for
 * the OWNER to share privately. It is never stored or shown again.
 */
function InvitationLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}${path}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-6 grid gap-3">
      <label htmlFor="invitation-link" className="text-body-sm font-medium">
        Invitation link
      </label>
      <p
        id="invitation-link-hint"
        className="text-body-sm text-muted-foreground"
      >
        Shown only once. Send it to the invited person privately; it works once
        and expires in 72 hours.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="invitation-link"
          readOnly
          value={url}
          aria-describedby="invitation-link-hint"
          onFocus={(event) => event.currentTarget.select()}
          className="block min-h-11 w-full rounded-control border border-border-strong bg-surface-muted px-3 py-2 font-mono text-body-sm"
        />
        <Button variant="secondary" onClick={copy}>
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </div>
  );
}

export function InviteForm() {
  const [state, action, pending] = useActionState(
    createInvitationAction,
    idleFormState,
  );

  return (
    <div>
      <form
        action={action}
        noValidate
        aria-busy={pending || undefined}
        onSubmit={(event) => pending && event.preventDefault()}
        className="grid gap-6"
      >
        <AdminField
          name="email"
          type="email"
          label="Email to invite"
          autoComplete="off"
          maxLength={adminLimits.email.max}
          defaultValue={state.values?.email}
          error={state.fieldErrors?.email}
        />
        <div>
          <SubmitButton pending={pending} pendingLabel="Creating invitation…">
            Create invitation
          </SubmitButton>
          <FormStatus state={state} />
        </div>
      </form>
      {state.invitationPath && <InvitationLink path={state.invitationPath} />}
    </div>
  );
}
