import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";

import { AuthError, verifyWalletSignIn } from "../service";
import {
  issueNonce,
  issuePendingWallet,
  issueSession,
  readNonce,
  readPendingWallet,
  readSession,
  sessionsEnabled,
  signInMessage,
} from "../session";

// A well-known test key — never a real wallet.
const TEST_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const account = privateKeyToAccount(TEST_KEY);

beforeEach(() => {
  process.env.WTR_SESSION_SECRET = "test-secret-do-not-use";
});
afterEach(() => {
  delete process.env.WTR_SESSION_SECRET;
});

describe("session cookies", () => {
  it("round-trips a session and rejects tampering", () => {
    const token = issueSession("creator-1", "0xabc");
    expect(readSession(token)).toEqual({ creatorId: "creator-1", wallet: "0xabc" });
    expect(readSession(token.slice(0, -2) + "zz")).toBeNull();
    expect(readSession("garbage")).toBeNull();
  });

  it("round-trips nonce and pending-wallet cookies", () => {
    const { nonce, cookieValue } = issueNonce();
    expect(readNonce(cookieValue)).toBe(nonce);
    const pending = issuePendingWallet("0xdef");
    expect(readPendingWallet(pending)).toBe("0xdef");
  });

  it("reports sessions disabled without the secret", () => {
    delete process.env.WTR_SESSION_SECRET;
    expect(sessionsEnabled()).toBe(false);
  });
});

describe("verifyWalletSignIn", () => {
  it("accepts a signature over the exact sign-in message", async () => {
    const nonce = "abc123";
    const signature = await account.signMessage({
      message: signInMessage(account.address, nonce),
    });
    const wallet = await verifyWalletSignIn({
      address: account.address,
      signature,
      nonce,
    });
    expect(wallet).toBe(account.address.toLowerCase());
  });

  it("rejects a signature over a different nonce", async () => {
    const signature = await account.signMessage({
      message: signInMessage(account.address, "other-nonce"),
    });
    await expect(
      verifyWalletSignIn({ address: account.address, signature, nonce: "abc123" }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a signature from a different wallet", async () => {
    const other = privateKeyToAccount(
      "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
    );
    const nonce = "abc123";
    const signature = await other.signMessage({
      message: signInMessage(account.address, nonce),
    });
    await expect(
      verifyWalletSignIn({ address: account.address, signature, nonce }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects malformed addresses and signatures", async () => {
    await expect(
      verifyWalletSignIn({ address: "not-an-address", signature: "0xaa", nonce: "n" }),
    ).rejects.toThrow(AuthError);
    await expect(
      verifyWalletSignIn({ address: account.address, signature: "not-hex", nonce: "n" }),
    ).rejects.toThrow(AuthError);
  });
});
