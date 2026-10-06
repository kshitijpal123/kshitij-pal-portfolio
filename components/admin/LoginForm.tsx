"use client";

import { useActionState } from "react";
import { AdminField } from "@/components/admin/AdminField";
import { FormStatus } from "@/components/admin/FormStatus";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { loginAction } from "@/lib/admin/actions";
import { idleFormState } from "@/lib/admin/formState";
import { adminLimits } from "@/lib/admin/validation";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, idleFormState);

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
        label="Email"
        autoComplete="username"
        maxLength={adminLimits.email.max}
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <AdminField
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        maxLength={adminLimits.password.max}
        error={state.fieldErrors?.password}
      />
      <div>
        <SubmitButton pending={pending} pendingLabel="Signing in…">
          Sign in
        </SubmitButton>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
