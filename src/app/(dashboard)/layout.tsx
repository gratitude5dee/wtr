import { DitherAvatar } from "@/components/dither-kit/avatar";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { getCurrentCreator } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const creator = await getCurrentCreator();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r p-4">
        <div className="mb-6 px-3 font-mono text-lg font-semibold tracking-tight">WTR</div>
        <SidebarNav />
        <div className="mt-auto flex items-center gap-3 px-3 pt-6">
          {creator ? (
            <>
              <DitherAvatar name={creator.avatarSeed} size={32} />
              <div className="min-w-0">
                <div className="truncate text-sm">{creator.displayName ?? creator.anonId}</div>
                <div className="truncate text-xs text-muted-foreground">
                  KYC {creator.kycStatus}
                </div>
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">No creator yet</div>
          )}
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
