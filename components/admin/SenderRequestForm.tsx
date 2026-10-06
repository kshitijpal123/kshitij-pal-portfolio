"use client";

import { useActionState } from "react";
import { AdminField } from "@/components/admin/AdminField";
import { FormStatus } from "@/components/admin/FormStatus";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { requestSenderIdentityAction } from "@/lib/admin/actions";
import { idleFormState } from "@/lib/admin/formState";
import { adminLimits } from "@/lib/admin/validation";

export function SenderRequestForm() {
  const [state, action, pending] = useActionState(
    requestSenderIdentityAction,
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
      <AdminField
        name="email"
        type="email"
        label="Gmail address"
        hint="The Google account you want to send from."
        autoComplete="email"
        maxLength={adminLimits.email.max}
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <div>
        <SubmitButton pending={pending} pendingLabel="Requesting…">
          Request approval
        </SubmitButton>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
