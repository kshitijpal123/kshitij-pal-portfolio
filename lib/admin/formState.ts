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
