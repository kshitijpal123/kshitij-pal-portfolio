"use client";

import {
  type FormEvent,
  startTransition,
  useActionState,
  useState,
  useSyncExternalStore,
} from "react";
import { controlClassName } from "@/components/admin/AdminField";
import {
  type ComposeContact,
  ComposeFields,
  type ComposeSender,
  type ComposeTemplate,
  FieldError,
} from "@/components/admin/ComposeForm";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { createScheduleAction } from "@/lib/admin/actions";
import type { FormState } from "@/lib/admin/formState";
import { maxDayOfMonth, type ScheduleType, weekdays } from "@/lib/admin/model";
import { isValidTimeZone, weekdayName } from "@/lib/admin/recurrence";

type ScheduleFormProps = {
  senders: ComposeSender[];
  contacts: ComposeContact[];
  templates: ComposeTemplate[];
  bulkEnabled: boolean;
  maxRecipients: number;
  timeZones: string[];
  windowDays: number;
  recurringAllowed: boolean;
};

/** `round` changes after each success, clearing the draft. */
type ScheduleFormState = FormState & { round: number };

const subscribeNever = () => () => {};
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverTimeZone = () => "UTC";

/**
 * Schedules the same draft the compose form sends. The browser submits a
 * local date and time with an IANA zone; the server converts, checks the
 * limits, and stores the schedule. Nothing is sent now.
 */
export function ScheduleForm({
  timeZones,
  windowDays,
  recurringAllowed,
  ...fields
}: ScheduleFormProps) {
  const [state, action, pending] = useActionState(
    async (previous: ScheduleFormState, data: FormData) => {
      const next = await createScheduleAction(previous, data);
      return {
        ...next,
        round: next.status === "success" ? previous.round + 1 : previous.round,
      };
    },
    { status: "idle", round: 0 } satisfies ScheduleFormState,
  );
  const detected = useSyncExternalStore(
    subscribeNever,
    browserTimeZone,
    serverTimeZone,
  );
  const [chosenZone, setChosenZone] = useState<string | null>(null);
  const [type, setType] = useState<ScheduleType>("ONE_TIME");
  const [frequency, setFrequency] = useState("DAILY");
  // The runtime's list may name a zone by its older alias (Asia/Calcutta for
  // Asia/Kolkata); a valid zone the browser reports is offered as well.
  const zones =
    timeZones.includes(detected) || !isValidTimeZone(detected)
      ? timeZones
      : ["UTC", ...[...timeZones.slice(1), detected].sort()];
  const zone = chosenZone ?? (zones.includes(detected) ? detected : "UTC");
  const errors = state.fieldErrors;
  const recurring = type === "RECURRING";

  // Submitted without React's automatic form reset, so a refused draft
  // stays as it was.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-busy={pending || undefined}
      className="grid gap-6"
    >
      <ComposeFields key={state.round} {...fields} errors={errors} />

      <fieldset aria-describedby="schedule-type-error">
        <legend className="text-body-sm font-medium">When</legend>
        <div className="mt-2 flex flex-wrap gap-6 text-body-sm">
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="type"
              value="ONE_TIME"
              checked={!recurring}
              onChange={() => setType("ONE_TIME")}
              className="size-4"
            />
            Once
          </label>
          {recurringAllowed && (
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="type"
                value="RECURRING"
                checked={recurring}
                onChange={() => setType("RECURRING")}
                className="size-4"
              />
              Repeating
            </label>
          )}
        </div>
        <FieldError id="schedule-type-error" error={errors?.type} />
      </fieldset>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label
            htmlFor="schedule-start"
            className="block text-body-sm font-medium"
          >
            {recurring ? "Starts" : "Send at"}
          </label>
          <p
            id="schedule-start-hint"
            className="mt-1 text-body-sm text-muted-foreground"
          >
            {recurring
              ? "Its time is the time of day for every send."
              : `At least 2 minutes and at most ${windowDays} days ahead.`}
          </p>
          <input
            key={state.round}
            id="schedule-start"
            name="startAt"
            type="datetime-local"
            required
            aria-invalid={errors?.startAt ? true : undefined}
            aria-describedby="schedule-start-hint schedule-start-error"
            className={controlClassName}
          />
          <FieldError id="schedule-start-error" error={errors?.startAt} />
        </div>
        <div>
          <label
            htmlFor="schedule-zone"
            className="block text-body-sm font-medium"
          >
            Time zone
          </label>
          <p
            id="schedule-zone-hint"
            className="mt-1 text-body-sm text-muted-foreground"
          >
            Times follow this zone, including daylight saving changes.
          </p>
          <select
            id="schedule-zone"
            name="timeZone"
            value={zone}
            onChange={(event) => setChosenZone(event.target.value)}
            aria-invalid={errors?.timeZone ? true : undefined}
            aria-describedby="schedule-zone-hint schedule-zone-error"
            className={controlClassName}
          >
            {zones.map((timeZone) => (
              <option key={timeZone} value={timeZone}>
                {timeZone}
              </option>
            ))}
          </select>
          <FieldError id="schedule-zone-error" error={errors?.timeZone} />
        </div>
      </div>

      {recurring && (
        <div className="grid gap-6">
          <div>
            <label
              htmlFor="schedule-frequency"
              className="block text-body-sm font-medium"
            >
              Repeats
            </label>
            <select
              id="schedule-frequency"
              name="frequency"
              value={frequency}
              onChange={(event) => setFrequency(event.target.value)}
              aria-describedby="schedule-frequency-error"
              className={controlClassName}
            >
              <option value="DAILY">Every day</option>
              <option value="WEEKLY">Every week, on chosen days</option>
              <option value="MONTHLY">Every month, on one day</option>
            </select>
            <FieldError
              id="schedule-frequency-error"
              error={errors?.frequency}
            />
          </div>

          {frequency === "WEEKLY" && (
            <fieldset aria-describedby="schedule-weekdays-error">
              <legend className="text-body-sm font-medium">Days</legend>
              <div className="mt-2 flex flex-wrap gap-x-6 text-body-sm">
                {weekdays.map((day) => (
                  <label key={day} className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      name="weekday"
                      value={day}
                      className="size-4"
                    />
                    {weekdayName(day)}
                  </label>
                ))}
              </div>
              <FieldError
                id="schedule-weekdays-error"
                error={errors?.weekdays}
              />
            </fieldset>
          )}

          {frequency === "MONTHLY" && (
            <div>
              <label
                htmlFor="schedule-day"
                className="block text-body-sm font-medium"
              >
                Day of the month
              </label>
              <p
                id="schedule-day-hint"
                className="mt-1 text-body-sm text-muted-foreground"
              >
                1 to {maxDayOfMonth}, so it exists in every month.
              </p>
              <input
                id="schedule-day"
                name="dayOfMonth"
                type="number"
                min={1}
                max={maxDayOfMonth}
                step={1}
                inputMode="numeric"
                aria-invalid={errors?.dayOfMonth ? true : undefined}
                aria-describedby="schedule-day-hint schedule-day-error"
                className={controlClassName}
              />
              <FieldError id="schedule-day-error" error={errors?.dayOfMonth} />
            </div>
          )}

          <div>
            <label
              htmlFor="schedule-end"
              className="block text-body-sm font-medium"
            >
              Ends (optional)
            </label>
            <p
              id="schedule-end-hint"
              className="mt-1 text-body-sm text-muted-foreground"
            >
              No sends after this. Leave empty to repeat until cancelled. The
              first send must be within {windowDays} days.
            </p>
            <input
              key={state.round}
              id="schedule-end"
              name="endAt"
              type="datetime-local"
              aria-invalid={errors?.endAt ? true : undefined}
              aria-describedby="schedule-end-hint schedule-end-error"
              className={controlClassName}
            />
            <FieldError id="schedule-end-error" error={errors?.endAt} />
          </div>
        </div>
      )}

      <div>
        <SubmitButton pending={pending} pendingLabel="Scheduling…">
          Schedule
        </SubmitButton>
        <div role="status" className="text-body-sm">
          {state.status === "success" && state.message && (
            <p className="mt-4 max-w-measure border-l-2 border-accent pl-3">
              {state.message}
            </p>
          )}
        </div>
        <div role="alert" className="text-body-sm">
          {state.status === "error" && state.message && (
            <p className="mt-4 max-w-measure border-l-2 border-danger pl-3">
              {state.message}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
