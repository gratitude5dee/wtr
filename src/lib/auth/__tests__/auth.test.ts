import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  issueNonce,
  issuePendingWallet,
  issueSession,
  readNonce,
  readPendingWallet,
  readSession,
  sessionsEnabled,
  walletAuthEnabled,
} from "../session";

beforeEach(() => {
  process.env.WTR_SESSION_SECRET = "test-secret-do-not-use";
  process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID = "test-client-id";
});
afterEach(() => {
  delete process.env.WTR_SESSION_SECRET;
  delete process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID;
});

describe("session cookies", () => {
  it("round-trips a session and rejects tampering", () => {
    const token = issueSession("creator-1", "0xabc");
    expect(readSession(token)).toEqual({ creatorId: "creator-1", wallet: "0xabc" });
    expect(readSession(token.slice(0, -2) + "zz")).toBeNull();
    expect(readSession("garbage")).toBeNull();
  });

  it("round-trips the pending-wallet cookie and rejects tampering", () => {
    const pending = issuePendingWallet("0xdef");
    expect(readPendingWallet(pending)).toBe("0xdef");
    expect(readPendingWallet(pending.slice(0, -2) + "zz")).toBeNull();
  });

  it("binds the nonce to the requesting wallet", () => {
    const cookie = issueNonce("nonce-1", "0xAbCd");
    expect(readNonce(cookie)).toEqual({ nonce: "nonce-1", address: "0xabcd" });
    expect(readNonce(cookie.slice(0, -2) + "zz")).toBeNull();
    expect(readNonce("garbage")).toBeNull();
  });

  it("reports auth disabled without the secret or client id", () => {
    delete process.env.WTR_SESSION_SECRET;
    expect(sessionsEnabled()).toBe(false);
    expect(walletAuthEnabled()).toBe(false);

    process.env.WTR_SESSION_SECRET = "x";
    delete process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID;
    expect(sessionsEnabled()).toBe(true);
    expect(walletAuthEnabled()).toBe(false);
  });

  it("treats an empty secret as unset — never an empty HMAC key", () => {
    process.env.WTR_SESSION_SECRET = "";
    expect(sessionsEnabled()).toBe(false);
    expect(walletAuthEnabled()).toBe(false);
  });

  it("rejects a session signed with a different secret", () => {
    const token = issueSession("creator-1", "0xabc");
    process.env.WTR_SESSION_SECRET = "another-secret";
    expect(readSession(token)).toBeNull();
  });
});
