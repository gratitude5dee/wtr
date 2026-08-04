/**
 * Server-side thirdweb SIWE auth. `createAuth` builds and verifies the
 * sign-in payload; sessions themselves stay ours (HMAC cookies in
 * `session.ts`) so nothing about identity depends on a third-party token.
 */
import { createThirdwebClient } from "thirdweb";
import { createAuth } from "thirdweb/auth";

import { AUTH_DOMAIN, THIRDWEB_CLIENT_ID } from "../../../config/env";

export function serverAuth() {
  const clientId = THIRDWEB_CLIENT_ID();
  if (!clientId) throw new Error("wallet auth is not configured");
  const client = createThirdwebClient({ clientId });
  return createAuth({
    domain: AUTH_DOMAIN(),
    client,
    login: {
      statement: "Sign in to WTR. Signing costs nothing and sends no transaction.",
    },
  });
}
