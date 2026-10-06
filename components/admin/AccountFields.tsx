import { AdminField } from "@/components/admin/AdminField";
import type { FormState } from "@/lib/admin/formState";
import { adminLimits } from "@/lib/admin/validation";

/** Name and a new password with confirmation, for owner setup and invitations. */
export function AccountFields({ state }: { state: FormState }) {
  return (
    <>
      <AdminField
        name="name"
        label="Your name"
        autoComplete="name"
        maxLength={adminLimits.name.max}
        defaultValue={state.values?.name}
        error={state.fieldErrors?.name}
      />
      <AdminField
        name="password"
        type="password"
        label="Password"
        hint={`At least ${adminLimits.password.min} characters. A passphrase works well.`}
        autoComplete="new-password"
        maxLength={adminLimits.password.max}
        error={state.fieldErrors?.password}
      />
      <AdminField
        name="confirmPassword"
        type="password"
        label="Confirm password"
        autoComplete="new-password"
        maxLength={adminLimits.password.max}
        error={state.fieldErrors?.confirmPassword}
      />
    </>
  );
}
