"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  LogOut,
  Search,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/searches", label: "Searches", icon: Search },
  { href: "/leads", label: "Leads", icon: Users },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
        LF
      </span>
      <span className="text-base font-semibold tracking-tight">LeadFlow</span>
    </Link>
  );
}

function NavLinks({ orientation }: { orientation: "vertical" | "horizontal" }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className={cn(
        orientation === "vertical"
          ? "flex flex-col gap-1"
          : // Wraps rather than scrolling sideways on narrow screens.
            "flex flex-wrap items-center gap-1",
      )}
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function PrototypeNotice() {
  return (
    <div className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">Prototype build</p>
      <p className="mt-0.5">
        Lead data is simulated. Searches and leads are stored in your account.
      </p>
    </div>
  );
}

/**
 * The signed-in account. Sign-out is a Server Action, so the session is
 * cleared server-side and the auth cookies are removed before the redirect —
 * nothing is left in the browser to reuse.
 */
function Account({
  email,
  displayName,
  orientation,
}: {
  email: string | null;
  displayName: string | null;
  orientation: "vertical" | "horizontal";
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 gap-2",
        orientation === "vertical"
          ? "flex-col rounded-lg border border-border px-3 py-2.5"
          : "flex-1 items-center justify-end",
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {displayName ?? email ?? "Signed in"}
        </p>
        {displayName && email ? (
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        ) : null}
      </div>
      <form action={signOutAction} className={orientation === "vertical" ? "" : "shrink-0"}>
        <Button
          type="submit"
          variant="outline"
          size="sm"
          className={orientation === "vertical" ? "w-full" : ""}
        >
          <LogOut className="size-4" aria-hidden="true" />
          Sign out
        </Button>
      </form>
    </div>
  );
}

interface AppShellProps {
  children: React.ReactNode;
  userEmail: string | null;
  displayName: string | null;
}

export function AppShell({ children, userEmail, displayName }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden border-r border-border bg-card lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:shrink-0 lg:flex-col lg:gap-6 lg:p-5">
        <Brand />
        <NavLinks orientation="vertical" />
        <div className="mt-auto space-y-3">
          <Account
            email={userEmail}
            displayName={displayName}
            orientation="vertical"
          />
          <PrototypeNotice />
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-20 flex flex-col gap-3 border-b border-border bg-card px-4 py-3 lg:hidden">
        <Brand />
        <NavLinks orientation="horizontal" />
        <Account
          email={userEmail}
          displayName={displayName}
          orientation="horizontal"
        />
      </header>

      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          {children}
        </div>
      </main>
    </div>
  );
}
