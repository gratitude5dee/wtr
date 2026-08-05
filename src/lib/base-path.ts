/**
 * The app is served under this path prefix (Next.js `basePath`) so the site
 * root can host a separate landing page. `next/link`, `useRouter`, and
 * `redirect()` prepend it automatically; plain `fetch()` to API routes and
 * raw HTML `<form action>` targets do not, so use `withBasePath` for those.
 */
export const BASE_PATH = "/app";

export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}
