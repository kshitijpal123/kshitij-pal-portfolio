import { Link, type LinkVariant } from "@/components/ui/Link";
import { siteConfig } from "@/lib/site/config";

type ResumeLinkProps = {
  variant?: LinkVariant;
  className?: string;
};

/** Renders nothing until `siteConfig.resumeHref` points at a real PDF. */
export function ResumeLink({ variant = "nav", className }: ResumeLinkProps) {
  if (!siteConfig.resumeHref) return null;

  return (
    <Link
      href={siteConfig.resumeHref}
      variant={variant}
      prefetch={false}
      className={className}
    >
      Resume
    </Link>
  );
}
