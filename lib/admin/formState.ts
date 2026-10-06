/** What a console form action returns to its `useActionState` form. */
export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<string, string>>;
  /** Non-secret values echoed back so a failed form keeps them. */
  values?: Partial<Record<string, string>>;
  /** Shown once to the OWNER after creating an invitation. */
  invitationPath?: string;
};

export const idleFormState: FormState = { status: "idle" };

/** One recipient's outcome, as shown after a send. */
export type ComposeResult = {
  email: string;
  status: "SENT" | "FAILED" | "UNCERTAIN" | "ALREADY_SENT" | "IN_PROGRESS";
  message: string;
};

/**
 * What the compose action returns. `operationId` is the idempotency key the
 * form submits next: unchanged until every recipient is handled, so sending
 * again after a partial failure retries only what was not sent.
 */
export type ComposeState = {
  status: "idle" | "error" | "success";
  operationId: string;
  message?: string;
  fieldErrors?: Partial<Record<string, string>>;
  results?: ComposeResult[];
};
