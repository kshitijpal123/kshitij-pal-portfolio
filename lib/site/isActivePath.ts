/**
 * Whether a navigation item is active for the current pathname. Items are
 * active on their own route and on nested routes (`/work/billsync` activates
 * `/work`); `/` is active only on the home page.
 */
export function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
