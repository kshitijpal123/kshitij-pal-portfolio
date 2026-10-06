import type { FormState } from "@/lib/admin/formState";

/**
 * The form's live regions. Both are always rendered, so a message added
 * after submission is announced.
 */
export function FormStatus({ state }: { state: FormState }) {
  return (
    <>
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
    </>
  );
}
