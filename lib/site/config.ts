export type NavItem = {
  label: string;
  href: string;
};

export type SocialLink = {
  label: string;
  /** `null` until a real profile URL exists; unset links are not rendered. */
  href: string | null;
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
   * Path of the résumé PDF in `public/resume/`, for example
   * `/resume/kshitij-pal-resume.pdf`. `null` until the file exists; every
   * résumé link is hidden while it is unset.
   */
  resumeHref: string | null;
  nav: readonly NavItem[];
  social: readonly SocialLink[];
};

export const siteConfig: SiteConfig = {
  name: "Kshitij Pal",
  role: "Backend Engineer",
  portrait: null,
  resumeHref: null,
  nav: [
    { label: "Home", href: "/" },
    { label: "Work", href: "/work" },
    { label: "Engineering", href: "/engineering" },
    { label: "Experience", href: "/experience" },
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
};
