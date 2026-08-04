"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

function getEthereum(): EthereumProvider | null {
  const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
  return eth ?? null;
}

export function WalletConnect({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const ethereum = getEthereum();
      if (!ethereum) {
        setError("No wallet found — install a browser wallet first.");
        return;
      }
      const accounts = (await ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const address = accounts[0];
      if (!address) {
        setError("Wallet returned no account.");
        return;
      }

      const nonceRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const nonceBody = (await nonceRes.json()) as { message?: string; error?: string };
      if (!nonceRes.ok || !nonceBody.message) {
        setError(nonceBody.error ?? "Could not start sign-in.");
        return;
      }

      const signature = (await ethereum.request({
        method: "personal_sign",
        params: [nonceBody.message, address],
      })) as string;

      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature }),
      });
      const verifyBody = (await verifyRes.json()) as {
        onboarded?: boolean;
        error?: string;
      };
      if (!verifyRes.ok) {
        setError(verifyBody.error ?? "Sign-in failed.");
        return;
      }
      router.push(verifyBody.onboarded ? "/" : "/onboarding");
      router.refresh();
    } catch {
      setError("Sign-in was cancelled or failed.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {signedIn ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={signOut}>
          Sign out
        </Button>
      ) : (
        <Button size="sm" disabled={busy} onClick={signIn}>
          Connect wallet
        </Button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
