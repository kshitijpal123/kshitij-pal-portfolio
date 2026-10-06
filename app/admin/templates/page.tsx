import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeading } from "@/components/admin/PageHeading";
import { TemplateForm } from "@/components/admin/TemplateForm";
import { TemplateList } from "@/components/admin/TemplateList";
import { Link } from "@/components/ui/Link";
import { getAdminStore } from "@/lib/admin/getAdminStore";
import { requireUser } from "@/lib/admin/session";
import { getUserSettings } from "@/lib/admin/settings";
import { getOwnTemplate, listOwnTemplates } from "@/lib/admin/templates";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage({
  searchParams,
}: PageProps<"/admin/templates">) {
  const user = await requireUser();
  const store = getAdminStore();
  const [query, settings] = await Promise.all([
    searchParams,
    getUserSettings(store, user.id),
  ]);

  if (!settings.templatesEnabled) {
    return (
      <AdminShell user={user} current="templates">
        <PageHeading title="Templates">
          <p>Templates are turned off for your account by the owner.</p>
        </PageHeading>
      </AdminShell>
    );
  }

  const editId = typeof query.edit === "string" ? query.edit.slice(0, 100) : "";
  const [templates, editing] = await Promise.all([
    listOwnTemplates(store, user),
    editId ? getOwnTemplate(store, user, editId) : null,
  ]);

  return (
    <AdminShell user={user} current="templates">
      <div className="grid gap-12">
        <PageHeading title="Templates">
          <p>
            Reusable subjects and messages. When you send to a contact,{" "}
            {"{{name}}"}, {"{{email}}"}, and {"{{company}}"} are replaced with
            their details. A send is refused, not sent, if a placeholder has no
            value for a recipient.
          </p>
        </PageHeading>

        <section aria-labelledby="template-form-heading">
          <h2 id="template-form-heading" className="text-h3">
            {editing ? `Edit ${editing.name}` : "Create a template"}
          </h2>
          <div className="mt-4 max-w-measure">
            <TemplateForm
              key={editing?.id ?? "new"}
              template={editing ?? undefined}
            />
            {editing && (
              <p className="mt-4 text-body-sm">
                <Link href="/admin/templates">Cancel editing</Link>
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby="templates-heading">
          <h2 id="templates-heading" className="text-h3">
            Your templates
          </h2>
          <div className="mt-4">
            <TemplateList templates={templates} />
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
