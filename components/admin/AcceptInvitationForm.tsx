"use client";

import { useActionState } from "react";
import { AccountFields } from "@/components/admin/AccountFields";
import { FormStatus } from "@/components/admin/FormStatus";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { acceptInvitationAction } from "@/lib/admin/actions";
import { idleFormState } from "@/lib/admin/formState";

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(
    acceptInvitationAction,
    idleFormState,
  );

  return (
    <form
      action={action}
      noValidate
      aria-busy={pending || undefined}
      onSubmit={(event) => pending && event.preventDefault()}
      className="grid gap-6"
    >
      <input type="hidden" name="token" value={token} />
      <AccountFields state={state} />
      <div>
        <SubmitButton pending={pending} pendingLabel="Creating account…">
          Create account
        </SubmitButton>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
