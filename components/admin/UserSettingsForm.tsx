"use client";

import { useActionState } from "react";
import { controlClassName } from "@/components/admin/AdminField";
import { FormStatus } from "@/components/admin/FormStatus";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { updateUserSettingsAction } from "@/lib/admin/actions";
import { idleFormState } from "@/lib/admin/formState";
import type { UserSettings } from "@/lib/admin/model";
import { settingBounds } from "@/lib/admin/validation";

const flags = [
  { name: "sendingEnabled", label: "Sending" },
  { name: "bulkSendingEnabled", label: "Bulk sending" },
  { name: "contactsEnabled", label: "Contacts" },
  { name: "templatesEnabled", label: "Templates" },
] as const;

const limits = [
  { name: "dailyTotalEmails", label: "Emails per day" },
  { name: "dailyBulkRecipients", label: "Bulk recipients per day" },
  { name: "maxBulkRecipientsPerOperation", label: "Recipients per bulk send" },
  { name: "maxScheduledEmails", label: "Active schedules" },
  { name: "maxRecurringSchedules", label: "Active repeating schedules" },
  { name: "maxFutureSchedulingWindowDays", label: "Schedule ahead (days)" },
] as const;

/** OWNER only: one user's feature switches and application limits. */
export function UserSettingsForm({
  settings,
  userName,
}: {
  settings: UserSettings;
  userName: string;
}) {
  const [state, action, pending] = useActionState(
    updateUserSettingsAction,
    idleFormState,
  );
  const id = (name: string) => `settings-${settings.userId}-${name}`;

  return (
    <form
      action={action}
      noValidate
      aria-busy={pending || undefined}
      aria-label={`Sending settings for ${userName}`}
      onSubmit={(event) => pending && event.preventDefault()}
      className="grid gap-4"
    >
      <input type="hidden" name="userId" value={settings.userId} />
      <fieldset className="flex flex-wrap gap-x-6 gap-y-2">
        <legend className="sr-only">Features</legend>
        {flags.map((flag) => (
          <label
            key={flag.name}
            className="flex min-h-11 items-center gap-2 text-body-sm"
          >
            <input
              type="checkbox"
              name={flag.name}
              defaultChecked={settings[flag.name]}
              className="size-4"
            />
            {flag.label}
            <span className="sr-only"> for {userName}</span>
          </label>
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        {limits.map((limit) => {
          const error = state.fieldErrors?.[limit.name];
          return (
            <div key={limit.name}>
              <label
                htmlFor={id(limit.name)}
                className="block text-body-sm font-medium"
              >
                {limit.label}
              </label>
              <input
                id={id(limit.name)}
                name={limit.name}
                type="number"
                inputMode="numeric"
                min={settingBounds[limit.name].min}
                max={settingBounds[limit.name].max}
                defaultValue={
                  state.values?.[limit.name] ?? String(settings[limit.name])
                }
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? id(`${limit.name}-error`) : undefined}
                className={controlClassName}
              />
              {error && (
                <p
                  id={id(`${limit.name}-error`)}
                  className="mt-2 text-body-sm text-danger"
                >
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div>
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save settings <span className="sr-only">for {userName}</span>
        </SubmitButton>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
