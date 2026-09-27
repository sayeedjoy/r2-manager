import { NavLink, Outlet } from "react-router-dom";
import { Files, Inbox, Settings, Users, ScrollText, HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBuckets } from "@/hooks/use-listing";

const navItems = [
  { to: "/mail", label: "Inbox", icon: Inbox },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/settings", label: "Settings", icon: Settings },
  { to: "/admin/audit", label: "Audit log", icon: ScrollText },
  { to: "/admin/health", label: "Health", icon: HeartPulse },
];

/** NFR-05: a simple responsive shell - a fixed sidebar on desktop, and the same links work fine on narrow viewports. */
export function AppShell() {
  const { data } = useBuckets();

  return (
    <div className="flex h-svh">
      <aside className="hidden w-56 flex-col border-r p-4 sm:flex">
        <div className="mb-6 text-sm font-semibold">R2 Manager</div>

        <div className="mb-1 text-xs font-medium text-muted-foreground">Buckets</div>
        <nav className="mb-4 flex flex-col gap-0.5">
          {data?.buckets.map((bucket) => (
            <NavLink
              key={bucket}
              to={`/b/${bucket}`}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                  isActive && "bg-accent font-medium",
                )
              }
            >
              <Files className="size-4" /> {bucket}
            </NavLink>
          ))}
        </nav>

        <div className="mb-1 text-xs font-medium text-muted-foreground">Manage</div>
        <nav className="flex flex-col gap-0.5">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                  isActive && "bg-accent font-medium",
                )
              }
            >
              <Icon className="size-4" /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
