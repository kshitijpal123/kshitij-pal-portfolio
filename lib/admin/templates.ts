import type { EmailTemplate, PublicUser } from "@/lib/admin/model";
import { getUserSettings } from "@/lib/admin/settings";
import type { AdminStore } from "@/lib/admin/store";
import type { TemplateInput } from "@/lib/admin/validation";

/*
 * Templates belong to the signed-in user and are addressed by the actor's
 * ID in the store, so another user's template is never found.
 */

/** A storage bound, not a security limit; checked before each create. */
export const maxTemplatesPerUser = 100;

const byName = (a: EmailTemplate, b: EmailTemplate) =>
  a.name.localeCompare(b.name);

async function templatesEnabled(store: AdminStore, actor: PublicUser) {
  return (await getUserSettings(store, actor.id)).templatesEnabled;
}

export async function listOwnTemplates(store: AdminStore, actor: PublicUser) {
  return (await store.listTemplates(actor.id)).sort(byName);
}

export async function getOwnTemplate(
  store: AdminStore,
  actor: PublicUser,
  templateId: string,
) {
  return templateId ? store.getTemplate(actor.id, templateId) : null;
}

export type TemplateOutcome = "saved" | "not-found" | "disabled" | "limit";

export async function createTemplate(
  store: AdminStore,
  actor: PublicUser,
  input: TemplateInput,
  now: Date,
): Promise<TemplateOutcome> {
  if (!(await templatesEnabled(store, actor))) return "disabled";
  if ((await store.listTemplates(actor.id)).length >= maxTemplatesPerUser) {
    return "limit";
  }
  const at = now.toISOString();
  await store.createTemplate({
    ...input,
    id: crypto.randomUUID(),
    userId: actor.id,
    createdAt: at,
    updatedAt: at,
  });
  return "saved";
}

export async function updateTemplate(
  store: AdminStore,
  actor: PublicUser,
  templateId: string,
  input: TemplateInput,
  now: Date,
): Promise<TemplateOutcome> {
  if (!(await templatesEnabled(store, actor))) return "disabled";
  const existing = await getOwnTemplate(store, actor, templateId);
  if (!existing) return "not-found";
  const saved = await store.updateTemplate({
    ...existing,
    ...input,
    id: existing.id,
    userId: actor.id,
    updatedAt: now.toISOString(),
  });
  return saved ? "saved" : "not-found";
}

export async function deleteTemplate(
  store: AdminStore,
  actor: PublicUser,
  templateId: string,
): Promise<"deleted" | "not-found" | "disabled"> {
  if (!(await templatesEnabled(store, actor))) return "disabled";
  if (!templateId) return "not-found";
  return (await store.deleteTemplate(actor.id, templateId))
    ? "deleted"
    : "not-found";
}
