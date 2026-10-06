import { Button } from "@/components/ui/Button";
import { Link } from "@/components/ui/Link";
import { deleteTemplateAction } from "@/lib/admin/actions";
import { formatTimestamp } from "@/lib/admin/format";
import type { EmailTemplate } from "@/lib/admin/model";

/** The signed-in user's own templates, each with edit and delete. */
export function TemplateList({ templates }: { templates: EmailTemplate[] }) {
  if (templates.length === 0) {
    return (
      <p className="text-body-sm text-muted-foreground">No templates yet.</p>
    );
  }

  return (
    <ul className="divide-y divide-border border-y border-border">
      {templates.map((template) => (
        <li key={template.id} className="grid gap-3 py-5">
          <div className="min-w-0">
            <p className="font-medium break-words">{template.name}</p>
            <p className="text-body-sm break-words">
              Subject: {template.subject}
            </p>
            <p className="mt-2 line-clamp-3 text-body-sm break-words whitespace-pre-line text-muted-foreground">
              {template.body}
            </p>
            <p className="mt-2 text-caption text-muted-foreground">
              Updated {formatTimestamp(template.updatedAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/admin/templates?edit=${encodeURIComponent(template.id)}`}
              className="inline-flex min-h-11 items-center text-body-sm"
            >
              Edit <span className="sr-only">{template.name}</span>
            </Link>
            <form action={deleteTemplateAction}>
              <input type="hidden" name="templateId" value={template.id} />
              <Button type="submit" variant="secondary">
                Delete <span className="sr-only">{template.name}</span>
              </Button>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}
