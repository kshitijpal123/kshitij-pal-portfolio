export type NavItem = {
  label: string;
  href: string;
};

export type SocialLink = {
  label: string;
  /** `null` until a real profile URL exists; unset links are not rendered. */
  href: string | null;
};

export type ContactMethod = {
  label: string;
  /** Shown as the link text. */
  value: string;
  href: string;
};

export type Portrait = {
  /** Path in `public/images/`, for example `/images/portrait.jpg`. */
  src: string;
  alt: string;
  width: number;
  height: number;
};

type SiteConfig = {
  name: string;
  role: string;
  /** `null` until a real photo exists; the Home hero renders none while unset. */
  portrait: Portrait | null;
  /**
   * Always `/resume/Kshitij-Pal-Resume.pdf` (the file in `public/resume/`)
   * once the PDF exists; the name never changes, so a new résumé replaces the
   * file. `null` until then; every résumé link is hidden while it is unset.
   */
  resumeHref: string | null;
  nav: readonly NavItem[];
  social: readonly SocialLink[];
  /** Direct contact, shown in the footer and on the Contact page. */
  contact: readonly ContactMethod[];
};

const email = "kshitij180123@gmail.com";
const phone = "+91 8791243983";

export const siteConfig: SiteConfig = {
  name: "Kshitij Pal",
  role: "Backend Engineer",
  portrait: null,
  resumeHref: null,
  nav: [
    { label: "Home", href: "/" },
    { label: "Work", href: "/work" },
    { label: "Experience", href: "/experience" },
    { label: "Engineering", href: "/engineering" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ],
  social: [
    { label: "GitHub", href: "https://github.com/kshitijpal123" },
    {
      label: "LinkedIn",
      href: "https://www.linkedin.com/in/kshitij-pal-963247195",
    },
  ],
  contact: [
    { label: "Email", value: email, href: `mailto:${email}` },
    { label: "Phone", value: phone, href: `tel:${phone.replaceAll(" ", "")}` },
  ],
};
