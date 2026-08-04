"use client";

import { useRouter } from "next/navigation";
import { createThirdwebClient } from "thirdweb";
import { ConnectButton, ThirdwebProvider } from "thirdweb/react";

import { generatePayload, isLoggedIn, login, logout } from "@/app/actions/auth";
import { storyAeneid } from "@/lib/auth/thirdweb-chain";

const clientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID ?? "";
const client = clientId ? createThirdwebClient({ clientId }) : null;

export function WalletConnect() {
  const router = useRouter();
  if (!client) return null;

  return (
    <ThirdwebProvider>
      <ConnectButton
        client={client}
        chain={storyAeneid}
        connectButton={{ label: "Connect wallet" }}
        auth={{
          getLoginPayload: (params) => generatePayload(params),
          doLogin: async (params) => {
            const { onboarded } = await login(params);
            router.push(onboarded ? "/" : "/onboarding");
            router.refresh();
          },
          isLoggedIn: (address) => isLoggedIn(address),
          doLogout: async () => {
            await logout();
            router.push("/");
            router.refresh();
          },
        }}
      />
    </ThirdwebProvider>
  );
}
