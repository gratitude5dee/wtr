import { DitherAvatar } from "@/components/dither-kit/avatar";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { TestnetBanner } from "@/components/dashboard/testnet-banner";
import { WalletConnect } from "@/components/dashboard/wallet-connect";
import { Badge } from "@/components/ui/badge";
import { walletAuthEnabled } from "@/lib/auth/session";
import { getCurrentCreator } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const creator = await getCurrentCreator();
  const walletAuth = walletAuthEnabled();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r p-4">
        <div className="mb-6 px-3">
          <div className="font-mono text-lg font-semibold tracking-tight">WTR</div>
          <div className="text-xs text-muted-foreground">A data exchange for humans</div>
        </div>
        <SidebarNav />
        <div className="mt-auto space-y-3 pt-6">
          {creator ? (
            <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
              <DitherAvatar name={creator.avatarSeed} size={32} />
              <div className="min-w-0">
                <div className="truncate text-sm">{creator.displayName ?? creator.anonId}</div>
                <Badge
                  variant="outline"
                  className={
                    creator.kycStatus === "verified"
                      ? "mt-1 border-transparent bg-[rgb(var(--tint-green)/0.12)] font-mono text-[10px] uppercase tracking-wider text-[rgb(var(--tint-green))]"
                      : "mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                  }
                >
                  KYC {creator.kycStatus}
                </Badge>
              </div>
            </div>
          ) : (
            !walletAuth && (
              <div className="px-3 text-xs text-muted-foreground">No creator yet</div>
            )
          )}
          {walletAuth && <WalletConnect />}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <TestnetBanner />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
