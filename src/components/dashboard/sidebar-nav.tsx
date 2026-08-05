"use client";

import {
  Coins,
  FolderOpen,
  Inbox,
  LayoutDashboard,
  LibraryBig,
  Settings,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavCounts } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";

const SECTIONS = [
  {
    label: "Creator",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/upload", label: "Upload", icon: Upload },
      { href: "/assets", label: "Assets", icon: FolderOpen, count: "assets" as const },
      { href: "/earnings", label: "Earnings", icon: Coins },
    ],
  },
  {
    label: "Buyer surface",
    items: [
      { href: "/catalog", label: "Catalog", icon: LibraryBig, count: "catalog" as const },
      { href: "/requests", label: "Requests", icon: Inbox, count: "requests" as const },
    ],
  },
  {
    label: "Account",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
] as const;

export function SidebarNav({ counts }: { counts?: NavCounts }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-5">
      {SECTIONS.map((section) => (
        <div key={section.label}>
          <div className="relative mb-1 h-4 px-3">
            <div className="rail-label font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {section.label}
            </div>
            <div className="absolute inset-x-2 top-1/2 border-t transition-opacity duration-200 group-hover/rail:opacity-0 group-focus-within/rail:opacity-0" />
          </div>
          <div className="flex flex-col gap-1">
            {section.items.map((item) => {
              const { href, label, icon: Icon } = item;
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              const count =
                "count" in item && counts ? counts[item.count] : undefined;
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="rail-label flex min-w-0 flex-1 items-center justify-between whitespace-nowrap">
                    {label}
                    {count !== undefined && (
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {count}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
