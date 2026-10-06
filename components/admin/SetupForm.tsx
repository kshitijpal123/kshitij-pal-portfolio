"use client";

import { useActionState } from "react";
import { AccountFields } from "@/components/admin/AccountFields";
import { AdminField } from "@/components/admin/AdminField";
import { FormStatus } from "@/components/admin/FormStatus";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { setupOwnerAction } from "@/lib/admin/actions";
import { idleFormState } from "@/lib/admin/formState";
import { adminLimits } from "@/lib/admin/validation";

export function SetupForm() {
  const [state, action, pending] = useActionState(
    setupOwnerAction,
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
        name="setupToken"
        type="password"
        label="Setup token"
        hint="The ADMIN_BOOTSTRAP_TOKEN value configured for this deployment."
        autoComplete="off"
        error={state.fieldErrors?.setupToken}
      />
      <AdminField
        name="email"
        type="email"
        label="Email"
        autoComplete="username"
        maxLength={adminLimits.email.max}
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <AccountFields state={state} />
      <div>
        <SubmitButton pending={pending} pendingLabel="Creating owner…">
          Create owner account
        </SubmitButton>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
