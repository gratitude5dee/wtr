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

import { cn } from "@/lib/utils";

const SECTIONS = [
  {
    label: "Creator",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/upload", label: "Upload", icon: Upload },
      { href: "/assets", label: "Assets", icon: FolderOpen },
      { href: "/earnings", label: "Earnings", icon: Coins },
    ],
  },
  {
    label: "Buyer surface",
    items: [
      { href: "/catalog", label: "Catalog", icon: LibraryBig },
      { href: "/requests", label: "Requests", icon: Inbox },
    ],
  },
  {
    label: "Account",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
] as const;

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-5">
      {SECTIONS.map((section) => (
        <div key={section.label}>
          <div className="mb-1 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {section.label}
          </div>
          <div className="flex flex-col gap-1">
            {section.items.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
