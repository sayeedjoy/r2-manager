import { HeartPulse, Inbox, ScrollText, Settings, Users, type LucideIcon } from "lucide-react";
import type { Capability } from "@r2-manager/shared";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavSection {
  label: string;
  /** The sidebar hides the whole section from users whose role lacks this. */
  capability: Capability;
  items: NavItem[];
}

/** Everything in the sidebar besides the bucket list, which comes from the API. */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Mail",
    capability: "mail:read",
    items: [{ to: "/mail", label: "Inbox", icon: Inbox }],
  },
  {
    label: "Admin",
    capability: "admin:manage",
    items: [
      { to: "/admin/users", label: "Users", icon: Users },
      { to: "/admin/settings", label: "Settings", icon: Settings },
      { to: "/admin/audit", label: "Audit log", icon: ScrollText },
      { to: "/admin/health", label: "Health", icon: HeartPulse },
    ],
  },
];

export function bucketPath(bucket: string, prefix = ""): string {
  const folder = prefix.replace(/\/$/, "");
  return folder ? `/b/${bucket}/${folder}` : `/b/${bucket}`;
}
