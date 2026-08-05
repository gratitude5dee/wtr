import { Suspense } from "react";

import { DitherAvatar } from "@/components/dither-kit/avatar";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { TestnetBanner } from "@/components/dashboard/testnet-banner";
import { WalletConnect } from "@/components/dashboard/wallet-connect";
import { Walkthrough } from "@/components/dashboard/walkthrough";
import { Badge } from "@/components/ui/badge";
import { walletAuthEnabled } from "@/lib/auth/session";
import { getCurrentCreator, getNavCounts } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const creator = await getCurrentCreator();
  const counts = await getNavCounts(creator?.id ?? null);
  const walletAuth = walletAuthEnabled();

  return (
    <div className="flex min-h-screen">
      {/* Reserves the collapsed rail's width; the rail itself expands as an
          overlay on hover so the page never reflows. */}
      <div className="w-[68px] shrink-0" />
      <aside className="nav-rail group/rail fixed inset-y-0 left-0 z-40 flex flex-col overflow-x-hidden overflow-y-auto border-r bg-background p-3">
        <div className="mb-6 flex h-10 items-center gap-2.5 px-2">
          <DitherAvatar name="wtr-exchange" hue={210} size={26} className="shrink-0 rounded-sm" />
          <div className="rail-label min-w-0">
            <div className="font-mono text-lg font-semibold leading-tight tracking-tight">
              WTR
            </div>
            <div className="truncate text-xs text-muted-foreground">
              A data exchange for humans
            </div>
          </div>
        </div>
        <SidebarNav counts={counts} />
        <div className="mt-auto space-y-3 pt-6">
          {creator ? (
            <div className="flex items-center gap-3 rounded-lg border bg-card p-2">
              <DitherAvatar name={creator.avatarSeed} size={28} />
              <div className="rail-label min-w-0">
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
              <div className="rail-label px-2 text-xs text-muted-foreground">
                No creator yet
              </div>
            )
          )}
          {walletAuth && (
            <div className="rail-label">
              <WalletConnect />
            </div>
          )}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <TestnetBanner />
        <main className="flex-1 p-8">{children}</main>
      </div>
      <Suspense fallback={null}>
        <Walkthrough />
      </Suspense>
    </div>
  );
}
